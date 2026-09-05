/**
 * @overview Private retained husky-di-rpc/1 Logical Session and replay state.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcPeerCursorClassificationEnum } from "@/enums/protocol/rpc-peer-cursor-classification.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolHost,
	IRpcProtocolInvocation,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcBindingPlan,
	IRpcResumeAttempt,
	IRpcSession,
	IRpcSessionBinding,
	IRpcSessionTerminationPlan,
	RpcResumeClaim,
	RpcResumeDecision,
	RpcResumeOutcome,
} from "@/interfaces/session/rpc-session.interface";
import type {
	IRpcReplayReservation,
	IRpcRetainedIncomingCall,
	IRpcRetainedTerminal,
	IRpcSessionCallRetention,
	RpcSessionCallRetentionFactory,
} from "@/interfaces/session/rpc-session-call-retention.interface";
import type {
	RpcActiveRecord,
	RpcCallMessage,
	RpcErrorMessage,
	RpcJsonRecord,
	RpcMessageEnvelope,
	RpcResultMessage,
	RpcSemanticMessage,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";
import { rpcSecurityCarriersEqual } from "@/utils/protocol/rpc-base64-url-32-schema.util";
import {
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "@/utils/rpc-session-retained-bytes.util";

export type CreateRpcSessionOptions = {
	readonly host: IRpcProtocolHost;
	readonly sessionId: string;
	readonly resumeToken: string;
	readonly onTerminal: () => void;
};

/** Retains one Session Incarnation independently from its current Connection. */
export class RpcSessionImpl implements IRpcSession {
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _codec: IRpcCodec;
	readonly _onTerminal: () => void;
	readonly _retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly _protectedRetainedBytesReservation: IRpcRetainedBytesReservation;
	_resumeToken: string | undefined;
	_sessionHost: IRpcProtocolSessionHost | undefined;
	_binding: RpcSessionBindingImpl | undefined;
	_bindingEpoch = 0;
	_resumeAttempt = 0;
	_highestAcceptedResumeAttempt = 0;
	_recoveryDeadline: number | undefined;
	_nextOutgoingSequence = 1;
	_outgoingSequenceExhausted = false;
	_highestSentSequence = 0;
	_receivedThrough = 0;
	_peerReceivedThrough = 0;
	_nextOutgoingCallOrdinal = 1;
	_outgoingCallOrdinalExhausted = false;
	_highestIncomingCallOrdinal = 0;
	_invocationCount = 0;
	_pendingInvocationBytes = 0;
	readonly _invocations = new Set<IRpcInvocationEntry>();
	readonly _pendingInvocations: IRpcInvocationEntry[] = [];
	readonly _outgoingCalls = new Map<string, IRpcInvocationEntry>();
	readonly _callRetention: IRpcSessionCallRetention;
	readonly _controlQueue: IRpcQueuedSemantic[] = [];
	_nextSequencedLane: "control" | "data" = "control";
	_ackDirty = false;
	_ackDue = false;
	_ackTimer: ReturnType<typeof setTimeout> | undefined;
	_healthTimer: ReturnType<typeof setTimeout> | undefined;
	_healthExpectedFireAt = 0;
	_healthStallGraceUntil = 0;
	_lastInboundActivityAt = 0;
	_nextProbeAt = 0;
	_pingDue = false;
	_pongDue = false;
	_probeSentLast = false;
	_recovering = false;
	_recoveryTimer: ReturnType<typeof setTimeout> | undefined;
	_counterDrainTimer: ReturnType<typeof setTimeout> | undefined;
	_shutdownTask: Promise<void> | undefined;
	_resolveShutdown: (() => void) | undefined;
	_draining = false;
	_counterDraining = false;
	_gracefulCloseStarted = false;
	_closed = false;

	public constructor(
		options: CreateRpcSessionOptions,
		dependencies: RpcSessionImplDependencies,
	) {
		const { host, onTerminal, resumeToken, sessionId } = options;
		const {
			codec,
			createCallRetention,
			counterExhausted = false,
			retainedBytesLedger,
		} = dependencies;
		this._host = host;
		this._retainedBytesLedger = retainedBytesLedger;
		const protectedRetainedBytesReservation = this._retainedBytesLedger.reserve(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (protectedRetainedBytesReservation === undefined) {
			throw new Error(
				"Default RPC Session cannot protect retained control state.",
			);
		}
		this._protectedRetainedBytesReservation = protectedRetainedBytesReservation;
		registerRpcSessionRetainedBytes(this, (bytes) =>
			this.reserveRetainedBytes(bytes),
		);
		this._sessionId = sessionId;
		this._codec = codec;
		this._callRetention = createCallRetention({
			codec,
			policy: host.policy,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
		});
		this._resumeToken = resumeToken;
		this._onTerminal = onTerminal;
		if (counterExhausted) {
			this._nextOutgoingSequence = RPC_LAST_ORDINARY_SEQUENCE + 1;
		}
	}

	get sessionId(): string {
		return this._sessionId;
	}

	get reclaimDeadline(): number | undefined {
		return this._recovering && !this._closed && this._binding === undefined
			? this._recoveryDeadline
			: undefined;
	}

	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		if (this._closed) {
			return undefined;
		}
		const sessionReservation = this._retainedBytesLedger.reserve(bytes);
		if (sessionReservation === undefined) {
			return undefined;
		}
		let ownerReservationCandidate: IRpcRetainedBytesReservation | undefined;
		try {
			ownerReservationCandidate = this._host.reserveRetainedBytes(bytes);
		} catch (error) {
			sessionReservation.release();
			throw error;
		}
		if (ownerReservationCandidate === undefined) {
			sessionReservation.release();
			return undefined;
		}
		const ownerReservation = ownerReservationCandidate;
		let released = false;
		return Object.freeze<IRpcRetainedBytesReservation>({
			release: () => {
				if (released) {
					return;
				}
				released = true;
				sessionReservation.release();
				ownerReservation.release();
			},
		});
	}

	prepareFresh(host: IRpcProtocolSessionHost): IRpcBindingPlan {
		const resumeToken = this._resumeToken;
		// Fresh binding is legal only for an open, unbound, never-recovered Session.
		const cannotPrepareFresh =
			this._closed ||
			resumeToken === undefined ||
			this._sessionHost !== undefined ||
			this._binding !== undefined ||
			this._bindingEpoch !== 0 ||
			this._recovering;
		if (cannotPrepareFresh) {
			throw new Error("Default RPC fresh binding plan is invalid.");
		}
		// Preserve provisional Topology admission so failed preparation can close it.
		this._sessionHost = host;
		return this._createBindingPlan({
			facts: this._snapshotCandidateFacts(),
			host,
			kind: "fresh",
			nextBindingEpoch: 1,
			peerReceivedThrough: 0,
		});
	}

	beginResume(): IRpcResumeAttempt {
		const resumeToken = this._resumeToken;
		const recoveryDeadline = this._recoveryDeadline;
		// Resume requires live retained authority within the active recovery window.
		const sessionIsNotRecoverable =
			this._closed ||
			!this._recovering ||
			this._binding !== undefined ||
			resumeToken === undefined ||
			recoveryDeadline === undefined ||
			Date.now() >= recoveryDeadline;
		if (sessionIsNotRecoverable) {
			throw new Error("Default RPC Session is not recoverable.");
		}
		if (this._resumeAttempt >= Number.MAX_SAFE_INTEGER) {
			throw new Error("Default RPC resumeAttempt counter is exhausted.");
		}
		this._resumeAttempt += 1;
		const resumeAttempt = this._resumeAttempt;
		const facts: RpcResumeAttemptFacts = Object.freeze({
			facts: this._snapshotCandidateFacts(),
			resumeAttempt,
		});
		let reviewed = false;
		return Object.freeze<IRpcResumeAttempt>({
			sessionId: this._sessionId,
			token: resumeToken,
			attempt: resumeAttempt,
			cursor: this._receivedThrough,
			review: (outcome: RpcResumeOutcome): RpcResumeDecision => {
				if (reviewed) {
					return this._rejectResumeDecision(
						"Default RPC resume attempt is unknown or already consumed.",
					);
				}
				reviewed = true;
				return this._reviewResumeOutcome(facts, outcome);
			},
		});
	}

	reviewResume(claim: RpcResumeClaim): RpcResumeDecision {
		const resumeToken = this._resumeToken;
		// A responder resume must present current Session authority and a newer attempt.
		const responderAuthorityIsInvalid =
			resumeToken === undefined ||
			this._closed ||
			!rpcSecurityCarriersEqual(claim.token, resumeToken) ||
			!this._canAcceptResumeAttempt(claim.attempt);
		if (responderAuthorityIsInvalid) {
			return this._rejectResumeDecision(
				"Default RPC resume was generically rejected.",
			);
		}
		const facts = this._snapshotCandidateFacts();
		if (
			this._classifyPeerCursor(claim.cursor) !==
			RpcPeerCursorClassificationEnum.valid
		) {
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(
					RpcCloseReasonEnum.continuityFailure,
					() =>
						this._candidateFactsCurrent(facts) &&
						this._canAcceptResumeAttempt(claim.attempt) &&
						this._classifyPeerCursor(claim.cursor) !==
							RpcPeerCursorClassificationEnum.valid,
				),
			});
		}
		const bindingEpoch = this._bindingEpoch + 1;
		return Object.freeze({
			kind: "bind",
			bindingEpoch,
			cursor: this._receivedThrough,
			plan: this._createBindingPlan({
				facts,
				kind: "responder-resume",
				nextBindingEpoch: bindingEpoch,
				peerReceivedThrough: claim.cursor,
				resumeAttempt: claim.attempt,
			}),
		});
	}

	terminateForced(): void {
		this._terminateRetainedSession(RpcCloseReasonEnum.forcedClose);
	}

	_reviewResumeOutcome(
		resume: RpcResumeAttemptFacts,
		outcome: RpcResumeOutcome,
	): RpcResumeDecision {
		if (!this._initiatorResumeCurrent(resume)) {
			return this._rejectResumeDecision(
				"Default RPC initiator resume attempt became stale.",
			);
		}
		if (outcome.kind === "rejected") {
			return this._rejectResumeDecision(
				"Default RPC resume was generically rejected.",
			);
		}
		if (
			outcome.kind === "continuity-failure" ||
			outcome.kind === "terminated"
		) {
			const reason =
				outcome.kind === "continuity-failure"
					? RpcCloseReasonEnum.continuityFailure
					: RpcCloseReasonEnum.remoteTerminated;
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(reason, () =>
					this._initiatorResumeCurrent(resume),
				),
			});
		}
		const contradictory =
			outcome.profile !== RPC_PROFILE ||
			outcome.sessionId !== this._sessionId ||
			!Number.isSafeInteger(outcome.bindingEpoch) ||
			outcome.bindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(outcome.cursor) !==
				RpcPeerCursorClassificationEnum.valid;
		if (contradictory) {
			return Object.freeze({
				kind: "terminate",
				plan: this._createTerminationPlan(
					RpcCloseReasonEnum.continuityFailure,
					() => this._initiatorResumeCurrent(resume),
				),
			});
		}
		return Object.freeze({
			kind: "bind",
			bindingEpoch: outcome.bindingEpoch,
			cursor: outcome.cursor,
			plan: this._createBindingPlan({
				facts: resume.facts,
				kind: "initiator-resume",
				nextBindingEpoch: outcome.bindingEpoch,
				peerReceivedThrough: outcome.cursor,
				resumeAttempt: resume.resumeAttempt,
			}),
		});
	}

	_rejectResumeDecision(message: string): RpcResumeDecision {
		return Object.freeze({ kind: "reject", error: new Error(message) });
	}

	_createBindingPlan(candidate: RpcBindingPlanFacts): IRpcBindingPlan {
		let consumed = false;
		return Object.freeze<IRpcBindingPlan>({
			install: (endpoint: IRpcEndpoint): IRpcSessionBinding => {
				if (consumed) {
					throw new Error(
						"Default RPC binding plan is unknown or already consumed.",
					);
				}
				consumed = true;
				return this._installBinding(candidate, endpoint);
			},
		});
	}

	_createTerminationPlan(
		reason:
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.remoteTerminated,
		isCurrent: () => boolean,
	): IRpcSessionTerminationPlan {
		let consumed = false;
		return Object.freeze<IRpcSessionTerminationPlan>({
			commit: (cause?: Error): void => {
				if (consumed) {
					throw new Error(
						"Default RPC Session termination plan is unknown or already consumed.",
					);
				}
				consumed = true;
				if (!isCurrent()) {
					throw new Error("Default RPC Session termination plan became stale.");
				}
				this._terminateRetainedSession(reason, cause);
			},
		});
	}

	_installBinding(
		prepared: RpcBindingPlanFacts,
		endpoint: IRpcEndpoint,
	): IRpcSessionBinding {
		const stale = this._validateBindingPlan(prepared, endpoint);
		if (stale !== undefined) {
			throw new Error(stale);
		}

		const binding = new RpcSessionBindingImpl(this, endpoint);
		try {
			endpoint.configureSendProgressTimeout(
				this._host.policy.sendProgressTimeoutMs,
			);
			endpoint.observeIngressIdle(() => this._bindingIngressIdle(binding));
		} catch (error) {
			throw error instanceof Error
				? error
				: new Error("Default RPC binding Endpoint setup failed.");
		}

		this._stopHealthTimer();
		this._healthStallGraceUntil = 0;
		this._pingDue = false;
		this._pongDue = false;
		const previousBinding = this._binding;
		if (prepared.kind === "fresh") {
			this._sessionHost = prepared.host;
		}
		if (prepared.kind === "responder-resume") {
			this._highestAcceptedResumeAttempt = prepared.resumeAttempt as number;
		}
		this._bindingEpoch = prepared.nextBindingEpoch;
		this._peerReceivedThrough = prepared.peerReceivedThrough;
		this._callRetention.resumeReplay(prepared.peerReceivedThrough);
		this._binding = binding;
		if (prepared.kind === "responder-resume") {
			this._cancelRecoveryDeadline();
		}
		this._checkGracefulShutdown();
		this._deferDirectClose(previousBinding?._endpoint);
		return binding;
	}

	_reserveBindingRetainedBytes(
		binding: RpcSessionBindingImpl,
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this._binding === binding && !this._closed
			? this.reserveRetainedBytes(bytes)
			: undefined;
	}

	_activateBinding(binding: RpcSessionBindingImpl): boolean {
		// Activation applies once to the current binding of an open Session.
		const cannotActivateBinding =
			this._binding !== binding || binding._active || this._closed;
		if (cannotActivateBinding) {
			return false;
		}
		binding._active = true;
		if (this._recoveryTimer !== undefined) {
			clearTimeout(this._recoveryTimer);
			this._recoveryTimer = undefined;
		}
		this._recoveryDeadline = undefined;
		if (this._recovering) {
			this._recovering = false;
			this._sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovered,
			});
		}
		if (this._binding !== binding || this._closed) {
			return false;
		}
		this._startHealthTimer(binding);
		// Exit bootstrap activation before replay can reenter the peer's reply gate.
		queueMicrotask(() => this._pump());
		return this._binding === binding && !this._closed;
	}

	_receiveBinding(binding: RpcSessionBindingImpl, bytes: Uint8Array): void {
		// Ingress is accepted only from the active current binding of an open Session.
		const bindingCannotReceive =
			this._closed || this._binding !== binding || !binding._active;
		if (bindingCannotReceive) {
			this._deferDirectClose(binding._endpoint);
			return;
		}

		let record: RpcActiveRecord;
		try {
			record = this._codec.decode(bytes, RpcDecodePhaseEnum.active);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC active record is invalid."),
			);
			return;
		}

		if (record.kind === RpcWireRecordKindEnum.ack) {
			if (this._applyAck(record.ackThrough)) {
				this._recordInboundActivity(binding);
			}
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.ping) {
			this._recordInboundActivity(binding);
			this._pongDue = true;
			this._pump();
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.pong) {
			this._recordInboundActivity(binding);
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.close) {
			this._terminalFromPeer();
			return;
		}
		if (record.kind !== RpcWireRecordKindEnum.message) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC active phase produced an invalid record kind."),
			);
			return;
		}
		if (this._receiveEnvelope(record)) {
			this._recordInboundActivity(binding);
		}
	}

	_bindingFailed(
		binding: RpcSessionBindingImpl,
		reason: RpcEndpointFailureEnum,
		error?: Error,
	): void {
		if (this._binding !== binding || this._closed) {
			return;
		}
		// Protocol and resource failures terminate the Session instead of recovering it.
		const isTerminalFailure =
			reason === RpcEndpointFailureEnum.protocol ||
			reason === RpcEndpointFailureEnum.resource;
		if (isTerminalFailure) {
			this._fault(
				reason === RpcEndpointFailureEnum.protocol
					? RpcCloseReasonEnum.protocolFault
					: RpcCloseReasonEnum.resourceFault,
				error ?? new Error(`Default RPC endpoint ${reason} failure.`),
			);
			return;
		}
		this._enterRecovery(error);
	}

	_bindingIngressIdle(binding: RpcSessionBindingImpl): void {
		if (this._binding !== binding || this._closed) {
			return;
		}
		this._pump();
		this._checkGracefulShutdown();
	}

	_snapshotCandidateFacts(): RpcSessionCandidateFacts {
		return Object.freeze({
			binding: this._binding,
			bindingEpoch: this._bindingEpoch,
			highestSentSequence: this._highestSentSequence,
			peerReceivedThrough: this._peerReceivedThrough,
			receivedThrough: this._receivedThrough,
			recovering: this._recovering,
			recoveryDeadline: this._recoveryDeadline,
		});
	}

	_candidateFactsCurrent(facts: RpcSessionCandidateFacts): boolean {
		return (
			!this._closed &&
			this._resumeToken !== undefined &&
			this._binding === facts.binding &&
			this._bindingEpoch === facts.bindingEpoch &&
			this._highestSentSequence === facts.highestSentSequence &&
			this._peerReceivedThrough === facts.peerReceivedThrough &&
			this._receivedThrough === facts.receivedThrough &&
			this._recovering === facts.recovering &&
			this._recoveryDeadline === facts.recoveryDeadline
		);
	}

	_initiatorRecoveryCurrent(facts: RpcSessionCandidateFacts): boolean {
		return (
			facts.recovering &&
			facts.binding === undefined &&
			facts.recoveryDeadline !== undefined &&
			Date.now() < facts.recoveryDeadline
		);
	}

	_initiatorResumeCurrent(candidate: RpcResumeAttemptFacts): boolean {
		return (
			candidate.resumeAttempt === this._resumeAttempt &&
			this._candidateFactsCurrent(candidate.facts) &&
			this._initiatorRecoveryCurrent(candidate.facts)
		);
	}

	_validateBindingPlan(
		candidate: RpcBindingPlanFacts,
		endpoint: IRpcEndpoint,
	): string | undefined {
		if (!this._candidateFactsCurrent(candidate.facts)) {
			return "Default RPC binding plan became stale.";
		}
		if (this._binding?._endpoint === endpoint) {
			return "Default RPC binding plan reused its current Endpoint.";
		}
		// Binding continuity requires a safe newer epoch and a valid peer cursor.
		const continuityIsInvalid =
			!Number.isSafeInteger(candidate.nextBindingEpoch) ||
			candidate.nextBindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(candidate.peerReceivedThrough) !==
				RpcPeerCursorClassificationEnum.valid;
		if (continuityIsInvalid) {
			return "Default RPC binding plan contradicts retained continuity.";
		}
		if (candidate.kind === "fresh") {
			return this._sessionHost === candidate.host &&
				candidate.host !== undefined &&
				candidate.nextBindingEpoch === 1 &&
				candidate.peerReceivedThrough === 0 &&
				this._bindingEpoch === 0 &&
				this._binding === undefined &&
				!this._recovering
				? undefined
				: "Default RPC fresh binding plan became stale.";
		}
		if (candidate.kind === "initiator-resume") {
			return candidate.resumeAttempt === this._resumeAttempt &&
				this._initiatorRecoveryCurrent(candidate.facts)
				? undefined
				: "Default RPC initiator binding plan became stale.";
		}
		return candidate.resumeAttempt !== undefined &&
			this._canAcceptResumeAttempt(candidate.resumeAttempt) &&
			candidate.nextBindingEpoch === this._bindingEpoch + 1
			? undefined
			: "Default RPC responder binding plan became stale.";
	}

	_classifyPeerCursor(cursor: number): RpcPeerCursorClassificationEnum {
		if (cursor < this._peerReceivedThrough) {
			return RpcPeerCursorClassificationEnum.lower;
		}
		if (cursor > this._highestSentSequence) {
			return RpcPeerCursorClassificationEnum.upper;
		}
		return RpcPeerCursorClassificationEnum.valid;
	}

	_canAcceptResumeAttempt(resumeAttempt: number): boolean {
		return (
			Number.isSafeInteger(resumeAttempt) &&
			resumeAttempt > 0 &&
			!this._closed &&
			this._resumeToken !== undefined &&
			resumeAttempt > this._highestAcceptedResumeAttempt &&
			(!this._recovering ||
				this._binding !== undefined ||
				(this._recoveryDeadline !== undefined &&
					Date.now() < this._recoveryDeadline)) &&
			this._bindingEpoch < Number.MAX_SAFE_INTEGER
		);
	}

	prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined {
		const pendingCharge = request.args.weight + 256;
		const maximumPendingBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		// Pending invocation admission requires an active Session and count/byte capacity.
		const cannotReserveInvocation =
			this._closed ||
			this._draining ||
			this._invocationCount >=
				this._host.policy.maxPendingInvocationsPerSession ||
			!Number.isSafeInteger(pendingCharge) ||
			pendingCharge > maximumPendingBytes - this._pendingInvocationBytes;
		if (cannotReserveInvocation) {
			return undefined;
		}
		const retainedBytesReservation = this.reserveRetainedBytes(pendingCharge);
		if (retainedBytesReservation === undefined) {
			return undefined;
		}
		this._invocationCount += 1;
		this._pendingInvocationBytes += pendingCharge;
		const entry: IRpcInvocationEntry = {
			request,
			finish,
			pendingCharge,
			retainedBytesReservation,
			pendingCharged: true,
			started: false,
			admitted: false,
			publicFinished: false,
			retired: false,
		};
		this._invocations.add(entry);
		return Object.freeze({
			start: () => this._startInvocation(entry),
			cancel: () => this._cancelInvocation(entry),
		});
	}

	shutdown(): Promise<void> {
		if (this._closed) {
			return Promise.resolve();
		}
		if (this._shutdownTask !== undefined) {
			return this._shutdownTask;
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		this._shutdownTask = promise;
		this._resolveShutdown = resolve;
		this._draining = true;
		this._checkGracefulShutdown();
		return this._shutdownTask;
	}

	forceClose(): void {
		if (this._closed) {
			return;
		}
		this._teardownTerminalState();
		this._onTerminal();
		this._resolveShutdown?.();
		this._resolveShutdown = undefined;
	}

	_receiveEnvelope(envelope: RpcMessageEnvelope): boolean {
		// An included ACK must advance only through retained sent evidence.
		const ackIsInvalid =
			envelope.ackThrough !== undefined && !this._applyAck(envelope.ackThrough);
		if (ackIsInvalid) {
			return false;
		}
		const expected = this._receivedThrough + 1;
		if (envelope.seq <= this._receivedThrough) {
			this._markAckDirty();
			return true;
		}
		if (envelope.seq !== expected) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC message sequence contains a gap."),
			);
			return false;
		}

		try {
			this._dispatchSemantic(envelope.message);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC semantic message is invalid."),
			);
			return false;
		}
		if (this._closed) {
			return false;
		}
		this._receivedThrough = envelope.seq;
		this._markAckDirty();
		return true;
	}

	_dispatchSemantic(message: RpcSemanticMessage): void {
		if (message.kind === RpcWireRecordKindEnum.call) {
			this._receiveCall(message);
			return;
		}
		if (message.kind === RpcWireRecordKindEnum.cancel) {
			this._receiveCancel(message.callId);
			return;
		}
		if (message.kind === RpcWireRecordKindEnum.result) {
			this._receiveResult(message);
			return;
		}
		this._receiveError(message);
	}

	_receiveCall(message: RpcCallMessage): void {
		const args = this._host.normalizeApplicationArguments(message.args);
		const ordinal = Number(message.callId);
		if (ordinal !== this._highestIncomingCallOrdinal + 1) {
			throw new Error("Default RPC Call Ordinal is not contiguous.");
		}
		const sessionHost = this._sessionHost;
		if (sessionHost === undefined) {
			throw new Error("Default RPC Session has no Framework host.");
		}
		if (this._draining || this._callRetention.incomingCount >= 256) {
			this._highestIncomingCallOrdinal = ordinal;
			this._queueError(message.callId, RpcExceptionCodeEnum.unavailable);
			return;
		}
		this._highestIncomingCallOrdinal = ordinal;
		const reserved = sessionHost.reserveIncomingCall(
			{
				service: message.service,
				method: message.method,
				args,
			},
			(reservation) => {
				if (reservation.kind === RpcIncomingCallKindEnum.unknown) {
					const terminal = {
						type: RpcCallTerminalTypeEnum.failed,
						code: reservation.code,
					} as const;
					const entry = this._callRetention.retainIncoming(
						message.callId,
						terminal,
					);
					// The retained identity precedes Framework commit and its observable event.
					entry.attach(reservation.commit());
					const completion = entry.selectCompletion(terminal);
					if (completion !== undefined) {
						completion.publish();
						this._queueRetainedTerminal(completion);
					}
					return undefined;
				}

				const entry = this._callRetention.retainIncoming(message.callId, {
					type: RpcCallTerminalTypeEnum.sessionTerminated,
				});
				// The retained identity precedes Framework commit and Handler scheduling.
				const incoming = reservation.commit();
				entry.attach(incoming);
				if (this._closed) {
					return undefined;
				}
				void incoming.handlerOutcome.then(
					(outcome) => this._finishIncomingHandler(entry, outcome),
					() =>
						this._finishIncomingHandler(entry, {
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						}),
				);
				return undefined;
			},
		);
		if (!reserved) {
			this._queueRetainedTerminal(
				this._callRetention.rejectIncoming(message.callId),
			);
		}
	}

	_receiveCancel(callId: string): void {
		if (Number(callId) > this._highestIncomingCallOrdinal) {
			throw new Error("Default RPC cancel refers to a future Call Ordinal.");
		}
		const completion = this._callRetention.cancelIncoming(callId);
		if (completion !== undefined) {
			completion.publish();
			this._queueRetainedTerminal(completion);
		}
	}

	_receiveResult(message: RpcResultMessage): void {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error("Default RPC result has no matching Logical Call.");
		}
		let outcome: RpcCallOutcome;
		if (Object.hasOwn(message, "value")) {
			outcome = {
				type: RpcCallTerminalTypeEnum.returned,
				value: this._host.normalizeApplicationValue(message.value),
			};
		} else {
			outcome = { type: RpcCallTerminalTypeEnum.returnedVoid };
		}
		this._finishInvocation(invocation, outcome);
		this._retireInvocation(invocation);
	}

	_receiveError(message: RpcErrorMessage): void {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error("Default RPC error has no matching Logical Call.");
		}
		if (Object.hasOwn(message.error as RpcJsonRecord, "details")) {
			this._host.normalizeApplicationValue(message.error.details);
		}
		this._finishInvocation(invocation, {
			type: RpcCallTerminalTypeEnum.failed,
			code: message.error.code,
		});
		this._retireInvocation(invocation);
	}

	_finishIncomingHandler(
		entry: IRpcRetainedIncomingCall,
		outcome: RpcHandlerOutcome,
	): void {
		const completion = entry.selectCompletion(outcome);
		if (completion !== undefined) {
			this._queueRetainedTerminal(completion);
			completion.publish();
		}
	}

	_queueRetainedTerminal(completion: IRpcRetainedTerminal): void {
		const replay = completion.replay;
		if (this._closed) {
			replay?.release();
			return;
		}
		if (replay === undefined) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error("Default RPC protected terminal reserve is exhausted."),
			);
			return;
		}
		this._controlQueue.push({ message: replay.message, replay });
		this._pump();
	}

	_queueError(callId: string, code: RpcWireErrorCode): boolean {
		const queued = this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.error,
				callId,
				error: Object.freeze({
					code,
					message: `Remote call failed with code ${code}.`,
				}),
			}) as RpcErrorMessage,
		);
		if (!queued) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error("Default RPC protected terminal reserve is exhausted."),
			);
		}
		return queued;
	}

	_queueSemantic(message: RpcSemanticMessage): boolean {
		if (this._closed) {
			return false;
		}
		const replay = this._callRetention.reserveReplay(message);
		if (replay === undefined) {
			return false;
		}
		this._controlQueue.push({ message, replay });
		this._pump();
		return true;
	}

	_startInvocation(entry: IRpcInvocationEntry): void {
		if (entry.started) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC invocation start was called more than once."),
			);
			return;
		}
		if (entry.retired) {
			return;
		}
		entry.started = true;
		if (this._closed) {
			this._finishInvocation(entry, {
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.unavailable,
			});
			this._retireInvocation(entry);
			return;
		}
		this._pendingInvocations.push(entry);
		this._pump();
	}

	_cancelInvocation(entry: IRpcInvocationEntry): void {
		if (entry.retired || entry.publicFinished) {
			return;
		}
		this._finishInvocation(entry, {
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.canceled,
		});
		if (!entry.admitted) {
			this._retireInvocation(entry);
			return;
		}
		this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.cancel,
				callId: entry.callId as string,
			}) as RpcSemanticMessage,
		);
	}

	_pump(): void {
		const binding = this._binding;
		// Sending requires an active current binding whose Endpoint is idle.
		const cannotPump =
			this._closed ||
			binding === undefined ||
			!binding._active ||
			!binding._endpoint.isSendIdle;
		if (cannotPump) {
			return;
		}

		while (this._pendingInvocations[0]?.retired) {
			this._pendingInvocations.shift();
		}
		const hasReplay = this._callRetention.hasReplayBarrier;
		const control = this._controlQueue[0];
		const pending = this._pendingInvocations[0];
		const probeDue = this._pongDue || this._pingDue;
		const ackDue = this._ackDue && this._ackDirty;
		const nonProbeDue =
			hasReplay || control !== undefined || pending !== undefined || ackDue;
		if (probeDue && (!this._probeSentLast || !nonProbeDue)) {
			this._probeSentLast = true;
			if (this._pongDue) {
				this._pongDue = false;
				this._sendUnsequenced(binding, {
					kind: RpcWireRecordKindEnum.pong,
				});
			} else {
				this._pingDue = false;
				this._sendUnsequenced(binding, {
					kind: RpcWireRecordKindEnum.ping,
				});
			}
			return;
		}

		if (hasReplay) {
			const replay = this._callRetention.takeReplay();
			if (replay !== undefined) {
				this._probeSentLast = false;
				this._sendEnvelope(binding, replay.sequence, replay.message);
			}
			return;
		}

		// Control traffic wins its turn when present and selected by the lane scheduler.
		const shouldSendControl =
			control !== undefined &&
			(pending === undefined || this._nextSequencedLane === "control");
		if (shouldSendControl) {
			this._controlQueue.shift();
			this._nextSequencedLane = "data";
			this._probeSentLast = false;
			this._admitSemantic(binding, control);
			return;
		}
		if (pending !== undefined) {
			this._nextSequencedLane = "control";
			this._probeSentLast = false;
			this._admitInvocation(binding, pending);
			return;
		}

		if (ackDue) {
			this._ackDue = false;
			this._ackDirty = false;
			this._probeSentLast = false;
			this._sendUnsequenced(binding, {
				kind: RpcWireRecordKindEnum.ack,
				ackThrough: this._receivedThrough,
			});
		}
		this._checkGracefulShutdown();
	}

	_admitInvocation(
		binding: RpcSessionBindingImpl,
		entry: IRpcInvocationEntry,
	): void {
		// Admission stops before either call or delivery sequencing can overflow.
		const invocationCounterIsExhausted =
			this._outgoingCallOrdinalExhausted ||
			!Number.isSafeInteger(this._nextOutgoingCallOrdinal) ||
			this._nextOutgoingSequence > RPC_LAST_ORDINARY_SEQUENCE;
		if (invocationCounterIsExhausted) {
			this._beginCounterDrain();
			return;
		}
		let request = entry.request;
		if (request === undefined) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC Pending Invocation lost its request."),
			);
			return;
		}
		const callId = String(this._nextOutgoingCallOrdinal);
		let message: RpcCallMessage | undefined = Object.freeze({
			kind: RpcWireRecordKindEnum.call,
			callId,
			service: request.service,
			method: request.method,
			args: request.args.value,
		}) as RpcCallMessage;
		const sequence = this._nextOutgoingSequence;
		this._releasePendingRetainedBytes(entry);
		let replay = this._callRetention.reserveReplay(message);
		if (replay === undefined) {
			// Keep the payload charged outside the entry so reentrant terminal cleanup
			// cannot release its guard before this admission frame returns.
			let retainedBytesGuard = this.reserveRetainedBytes(entry.pendingCharge);
			if (retainedBytesGuard === undefined) {
				entry.request = undefined;
				request = undefined;
				message = undefined;
				this._fault(
					RpcCloseReasonEnum.resourceFault,
					new Error("Default RPC Pending retained-byte charge was lost."),
				);
				return;
			}
			entry.request = undefined;
			request = undefined;
			message = undefined;
			this._pendingInvocations.shift();
			this._releasePendingInvocationCharge(entry);
			try {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
			} finally {
				try {
					this._retireInvocation(entry);
				} finally {
					retainedBytesGuard.release();
					retainedBytesGuard = undefined;
				}
			}
			this._pump();
			return;
		}
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(this._createEnvelope(sequence, message));
		} catch {
			let guardedReplay: IRpcReplayReservation | undefined = replay;
			replay = undefined;
			entry.request = undefined;
			request = undefined;
			message = undefined;
			this._pendingInvocations.shift();
			this._releasePendingInvocationCharge(entry);
			try {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
			} finally {
				try {
					this._retireInvocation(entry);
				} finally {
					guardedReplay.release();
					guardedReplay = undefined;
				}
			}
			this._pump();
			return;
		}

		this._pendingInvocations.shift();
		if (this._nextOutgoingCallOrdinal === Number.MAX_SAFE_INTEGER) {
			this._outgoingCallOrdinalExhausted = true;
		} else {
			this._nextOutgoingCallOrdinal += 1;
		}
		this._nextOutgoingSequence += 1;
		this._highestSentSequence = sequence;
		entry.admitted = true;
		entry.callId = callId;
		this._releasePendingInvocationCharge(entry);
		this._outgoingCalls.set(callId, entry);
		this._callRetention.commitReplay(sequence, replay);
		entry.request = undefined;
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
		if (this._outgoingCallOrdinalExhausted) {
			this._beginCounterDrain();
		}
	}

	_admitSemantic(
		binding: RpcSessionBindingImpl,
		queued: IRpcQueuedSemantic,
	): void {
		const { message, replay } = queued;
		// Sequenced delivery stops before the safe-integer or wire sequence limit.
		const outgoingSequenceIsExhausted =
			this._outgoingSequenceExhausted ||
			!Number.isSafeInteger(this._nextOutgoingSequence);
		if (outgoingSequenceIsExhausted) {
			replay.release();
			this._terminateRetainedSession(
				RpcCloseReasonEnum.counterExhaustion,
				new Error("Default RPC sequence counter is exhausted."),
			);
			return;
		}
		const sequence = this._nextOutgoingSequence;
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(this._createEnvelope(sequence, message));
		} catch (error) {
			replay.release();
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				error instanceof Error
					? error
					: new Error("Default RPC terminal cannot be encoded."),
			);
			return;
		}
		if (sequence === Number.MAX_SAFE_INTEGER) {
			this._outgoingSequenceExhausted = true;
		} else {
			this._nextOutgoingSequence += 1;
		}
		this._highestSentSequence = sequence;
		this._callRetention.commitReplay(sequence, replay);
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_sendEnvelope(
		binding: RpcSessionBindingImpl,
		sequence: number,
		message: RpcSemanticMessage,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(this._createEnvelope(sequence, message));
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				error instanceof Error
					? error
					: new Error("Default RPC replay cannot be encoded."),
			);
			return;
		}
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_createEnvelope(
		sequence: number,
		message: RpcSemanticMessage,
	): RpcMessageEnvelope {
		return (
			this._ackDirty
				? {
						kind: RpcWireRecordKindEnum.message,
						seq: sequence,
						ackThrough: this._receivedThrough,
						message,
					}
				: { kind: RpcWireRecordKindEnum.message, seq: sequence, message }
		) as RpcMessageEnvelope;
	}

	_consumePiggybackAck(): void {
		if (!this._ackDirty) {
			return;
		}
		this._ackDirty = false;
		this._ackDue = false;
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
	}

	_sendUnsequenced(
		binding: RpcSessionBindingImpl,
		record: RpcJsonRecord,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(record);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC control record cannot be encoded."),
			);
			return;
		}
		this._sendEncoded(binding, encoded);
	}

	_sendEncoded(binding: RpcSessionBindingImpl, encoded: Uint8Array): void {
		void binding._endpoint.sendNow(encoded).then(
			() => {
				if (this._binding === binding) {
					this._pump();
				}
			},
			(error) => {
				if (this._binding === binding) {
					this._enterRecovery(
						error instanceof Error
							? error
							: new Error("Default RPC Connection send failed."),
					);
				}
			},
		);
	}

	_applyAck(ackThrough: number, checkGracefulShutdown = true): boolean {
		if (ackThrough > this._highestSentSequence) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC ACK exceeds the highest sent sequence."),
			);
			return false;
		}
		if (ackThrough <= this._peerReceivedThrough) {
			return true;
		}
		this._peerReceivedThrough = ackThrough;
		this._callRetention.acknowledge(ackThrough);
		if (checkGracefulShutdown) {
			this._checkGracefulShutdown();
		}
		return true;
	}

	_markAckDirty(): void {
		this._ackDirty = true;
		if (this._ackTimer !== undefined || this._ackDue) {
			return;
		}
		this._ackTimer = setTimeout(() => {
			this._ackTimer = undefined;
			this._ackDue = true;
			this._pump();
		}, this._host.policy.ackDelayMs);
	}

	_finishInvocation(entry: IRpcInvocationEntry, outcome: RpcCallOutcome): void {
		if (entry.publicFinished) {
			return;
		}
		entry.publicFinished = true;
		entry.finish(outcome);
	}

	_terminateOpenCalls(): void {
		for (const entry of [...this._invocations]) {
			this._finishInvocation(
				entry,
				entry.admitted
					? {
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.outcomeUnknown,
						}
					: {
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.unavailable,
						},
			);
			this._retireInvocation(entry);
		}
		this._callRetention.terminateIncoming();
	}

	_retireInvocation(entry: IRpcInvocationEntry): void {
		if (entry.retired) {
			return;
		}
		entry.retired = true;
		const pendingIndex = this._pendingInvocations.indexOf(entry);
		if (pendingIndex !== -1) {
			this._pendingInvocations.splice(pendingIndex, 1);
		}
		entry.request = undefined;
		this._releasePendingInvocationCharge(entry);
		this._invocations.delete(entry);
		if (entry.callId !== undefined) {
			this._outgoingCalls.delete(entry.callId);
		}
		this._invocationCount -= 1;
		this._checkGracefulShutdown();
	}

	_releasePendingInvocationCharge(entry: IRpcInvocationEntry): void {
		if (!entry.pendingCharged) {
			return;
		}
		entry.pendingCharged = false;
		this._pendingInvocationBytes -= entry.pendingCharge;
		this._releasePendingRetainedBytes(entry);
	}

	_releasePendingRetainedBytes(entry: IRpcInvocationEntry): void {
		const reservation = entry.retainedBytesReservation;
		entry.retainedBytesReservation = undefined;
		reservation?.release();
	}

	_releaseReplayState(): void {
		this._callRetention.releaseReplay();
		for (const queued of this._controlQueue) {
			queued.replay.release();
		}
		this._controlQueue.length = 0;
	}

	_beginCounterDrain(): void {
		if (this._closed || this._counterDraining) {
			return;
		}
		this._counterDraining = true;
		this._draining = true;
		this._sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		this._counterDrainTimer = setTimeout(() => {
			this._counterDrainTimer = undefined;
			this._terminateRetainedSession(
				RpcCloseReasonEnum.counterExhaustion,
				new Error("Default RPC counter drain deadline expired."),
			);
		}, this._host.policy.shutdownDeadlineMs);
		for (const entry of [...this._invocations]) {
			if (!entry.admitted) {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
				this._retireInvocation(entry);
			}
		}
		this._checkGracefulShutdown();
	}

	_enterRecovery(cause?: Error): void {
		if (this._closed) {
			return;
		}
		const binding = this._binding;
		this._binding = undefined;
		const recoveryDeadlineAtLoss =
			this._recoveryTimer === undefined
				? Date.now() + this._host.policy.recoveryGraceMs
				: undefined;
		this._stopHealthTimer();
		this._healthStallGraceUntil = 0;
		this._pingDue = false;
		this._pongDue = false;
		this._deferDirectClose(binding?._endpoint);
		if (this._counterDraining) {
			this._terminateRetainedSession(
				RpcCloseReasonEnum.counterExhaustion,
				cause,
			);
			return;
		}
		if (this._draining) {
			this._terminateRetainedSession(RpcCloseReasonEnum.forcedClose, cause);
			return;
		}
		if (this._recoveryTimer === undefined) {
			const recoveryDeadline =
				recoveryDeadlineAtLoss ??
				Date.now() + this._host.policy.recoveryGraceMs;
			this._recoveryDeadline = recoveryDeadline;
			this._recoveryTimer = setTimeout(
				() => this._expireRecovery(),
				Math.max(0, recoveryDeadline - Date.now()),
			);
		}
		if (!this._recovering) {
			this._recovering = true;
			this._sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
				cause,
			});
		}
	}

	_cancelRecoveryDeadline(): void {
		if (this._recoveryTimer !== undefined) {
			clearTimeout(this._recoveryTimer);
			this._recoveryTimer = undefined;
		}
		this._recoveryDeadline = undefined;
	}

	_expireRecovery(): void {
		if (this._closed || !this._recovering) {
			return;
		}
		this._teardownTerminalState();
		this._sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.recoveryExpired,
		});
		this._onTerminal();
	}

	_terminateRetainedSession(
		reason:
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.counterExhaustion
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.remoteTerminated,
		cause?: Error,
	): void {
		if (this._closed) {
			return;
		}
		this._teardownTerminalState();
		this._sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason,
			cause,
		});
		this._onTerminal();
		this._resolveShutdown?.();
		this._resolveShutdown = undefined;
	}

	_terminalFromPeer(): void {
		if (this._closed) {
			return;
		}
		this._teardownTerminalState();
		this._sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		this._onTerminal();
	}

	_teardownTerminalState(): void {
		const binding = this._binding;
		this._closed = true;
		this._binding = undefined;
		this._clearTimers();
		this._terminateOpenCalls();
		this._releaseReplayState();
		this._protectedRetainedBytesReservation.release();
		unregisterRpcSessionRetainedBytes(this);
		this._resumeToken = undefined;
		try {
			binding?._endpoint.fenceAndClose();
		} catch {
			// Terminal Direct Close is best-effort after Session state is committed.
		}
	}

	_deferDirectClose(endpoint: IRpcEndpoint | undefined): void {
		if (endpoint === undefined) {
			return;
		}
		queueMicrotask(() => {
			try {
				endpoint.fenceAndClose();
			} catch {
				// Direct Close is best-effort after exact binding authority is revoked.
			}
		});
	}

	_fault(
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		error: Error,
	): void {
		if (this._closed) {
			return;
		}
		const sessionHost = this._sessionHost;
		if (sessionHost === undefined) {
			this.forceClose();
			return;
		}
		sessionHost.fault(reason, error);
	}

	_clearTimers(): void {
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
		if (this._recoveryTimer !== undefined) {
			clearTimeout(this._recoveryTimer);
			this._recoveryTimer = undefined;
		}
		if (this._counterDrainTimer !== undefined) {
			clearTimeout(this._counterDrainTimer);
			this._counterDrainTimer = undefined;
		}
		this._stopHealthTimer();
		this._healthStallGraceUntil = 0;
		this._recoveryDeadline = undefined;
	}

	_startHealthTimer(binding: RpcSessionBindingImpl): void {
		this._stopHealthTimer();
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._scheduleHealthTimer(binding);
	}

	_recordInboundActivity(binding: RpcSessionBindingImpl): void {
		// Activity belongs only to the active current binding of an open Session.
		const bindingIsStale =
			this._binding !== binding || !binding._active || this._closed;
		if (bindingIsStale) {
			return;
		}
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._pingDue = false;
		this._scheduleHealthTimer(binding);
	}

	_scheduleHealthTimer(binding: RpcSessionBindingImpl): void {
		this._stopHealthTimer();
		// Health checks run only for the active current binding of an open Session.
		const bindingIsStale =
			this._binding !== binding || !binding._active || this._closed;
		if (bindingIsStale) {
			return;
		}
		const silenceAt = Math.max(
			this._lastInboundActivityAt + this._host.policy.silenceTimeoutMs,
			this._healthStallGraceUntil,
		);
		this._healthExpectedFireAt = Math.min(this._nextProbeAt, silenceAt);
		this._healthTimer = setTimeout(
			() => this._healthTimerFired(binding),
			Math.max(0, this._healthExpectedFireAt - Date.now()),
		);
	}

	_healthTimerFired(binding: RpcSessionBindingImpl): void {
		this._healthTimer = undefined;
		// A timer firing from any replaced or inactive binding has no authority.
		const timerIsStale =
			this._binding !== binding || !binding._active || this._closed;
		if (timerIsStale) {
			return;
		}
		const now = Date.now();
		if (
			now - this._healthExpectedFireAt >
			this._host.policy.activityProbeIntervalMs
		) {
			this._pingDue = true;
			this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
			this._healthStallGraceUntil = this._nextProbeAt;
			this._pump();
			this._scheduleHealthTimer(binding);
			return;
		}
		// Silence is authoritative only after both the activity deadline and stall grace expire.
		const bindingIsSilent =
			now - this._lastInboundActivityAt >= this._host.policy.silenceTimeoutMs &&
			now >= this._healthStallGraceUntil;
		if (bindingIsSilent) {
			this._enterRecovery(new Error("Default RPC binding became silent."));
			return;
		}
		if (now >= this._nextProbeAt) {
			this._pingDue = true;
			this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
			this._pump();
		}
		this._scheduleHealthTimer(binding);
	}

	_stopHealthTimer(): void {
		if (this._healthTimer !== undefined) {
			clearTimeout(this._healthTimer);
			this._healthTimer = undefined;
		}
		this._healthExpectedFireAt = 0;
	}

	_checkGracefulShutdown(): void {
		// Drain evaluation runs only after shutdown starts and before closure begins.
		const shouldNotCheckGracefulShutdown =
			(this._shutdownTask === undefined && !this._counterDraining) ||
			this._closed ||
			this._gracefulCloseStarted;
		if (shouldNotCheckGracefulShutdown) {
			return;
		}
		const binding = this._binding;
		if (binding === undefined || this._recovering) {
			if (this._counterDraining) {
				this._terminateRetainedSession(RpcCloseReasonEnum.counterExhaustion);
			} else {
				this.forceClose();
			}
			return;
		}
		// Graceful close waits for all retained work and binding I/O to drain.
		const drainIsIncomplete =
			this._invocations.size !== 0 ||
			this._callRetention.hasActiveIncoming ||
			this._pendingInvocations.some((entry) => !entry.retired) ||
			this._controlQueue.length !== 0 ||
			this._callRetention.hasReplayBarrier ||
			this._callRetention.replayCount !== 0 ||
			this._ackDirty ||
			this._ackDue ||
			!binding._active ||
			!binding._endpoint.isIngressIdle ||
			!binding._endpoint.isSendIdle;
		if (drainIsIncomplete) {
			return;
		}
		this._gracefulCloseStarted = true;
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode({ kind: RpcWireRecordKindEnum.close });
		} catch {
			this.forceClose();
			return;
		}
		void binding._endpoint.sendNow(encoded).then(
			() => {
				if (this._counterDraining) {
					this._terminateRetainedSession(RpcCloseReasonEnum.counterExhaustion);
				} else {
					this.forceClose();
				}
			},
			(error: unknown) => {
				if (this._counterDraining) {
					this._terminateRetainedSession(
						RpcCloseReasonEnum.counterExhaustion,
						error instanceof Error ? error : undefined,
					);
				} else {
					this.forceClose();
				}
			},
		);
	}
}

type RpcSessionImplDependencies = Readonly<{
	readonly codec: IRpcCodec;
	readonly createCallRetention: RpcSessionCallRetentionFactory;
	readonly counterExhausted?: boolean;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
}>;

type RpcSessionCandidateFacts = Readonly<{
	readonly binding: RpcSessionBindingImpl | undefined;
	readonly bindingEpoch: number;
	readonly highestSentSequence: number;
	readonly peerReceivedThrough: number;
	readonly receivedThrough: number;
	readonly recovering: boolean;
	readonly recoveryDeadline: number | undefined;
}>;

type RpcBindingPlanFacts = Readonly<{
	readonly facts: RpcSessionCandidateFacts;
	readonly host?: IRpcProtocolSessionHost;
	readonly kind: "fresh" | "initiator-resume" | "responder-resume";
	readonly nextBindingEpoch: number;
	readonly peerReceivedThrough: number;
	readonly resumeAttempt?: number;
}>;

type RpcResumeAttemptFacts = Readonly<{
	readonly facts: RpcSessionCandidateFacts;
	readonly resumeAttempt: number;
}>;

interface IRpcInvocationEntry {
	request?: IRpcProtocolCallRequest;
	readonly finish: (outcome: RpcCallOutcome) => void;
	readonly pendingCharge: number;
	retainedBytesReservation?: IRpcRetainedBytesReservation;
	pendingCharged: boolean;
	started: boolean;
	admitted: boolean;
	publicFinished: boolean;
	retired: boolean;
	callId?: string;
}

interface IRpcQueuedSemantic {
	readonly message: RpcSemanticMessage;
	readonly replay: IRpcReplayReservation;
}

const RPC_SEQUENCE_RESERVE = 512;
const RPC_LAST_ORDINARY_SEQUENCE =
	Number.MAX_SAFE_INTEGER - RPC_SEQUENCE_RESERVE;

/** Exact authority for one installed Physical Connection Binding Epoch. */
class RpcSessionBindingImpl implements IRpcSessionBinding {
	readonly _session: RpcSessionImpl;
	readonly _endpoint: IRpcEndpoint;
	_active = false;
	_activationAttempted = false;

	constructor(session: RpcSessionImpl, endpoint: IRpcEndpoint) {
		this._session = session;
		this._endpoint = endpoint;
	}

	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this._session._reserveBindingRetainedBytes(this, bytes);
	}

	receive(bytes: Uint8Array): void {
		this._session._receiveBinding(this, bytes);
	}

	fail(reason: RpcEndpointFailureEnum, error?: Error): void {
		this._session._bindingFailed(this, reason, error);
	}

	activate(): boolean {
		if (this._activationAttempted) {
			return false;
		}
		this._activationAttempted = true;
		return this._session._activateBinding(this);
	}
}
