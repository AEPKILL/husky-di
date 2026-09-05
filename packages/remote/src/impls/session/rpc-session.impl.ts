/**
 * @overview Coordinates retained Session authority, call lifetimes, and outbound scheduling.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcPeerCursorClassificationEnum } from "@/enums/protocol/rpc-peer-cursor-classification.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
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
	RpcSessionFactory,
} from "@/interfaces/session/rpc-session.interface";
import type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "@/interfaces/session/rpc-session-activity.interface";
import type {
	IRpcReplayReservation,
	IRpcSessionCallRetention,
	RpcSessionCallRetentionFactory,
} from "@/interfaces/session/rpc-session-call-retention.interface";
import type {
	IRpcSessionIncomingCalls,
	RpcSessionIncomingCallsFactory,
} from "@/interfaces/session/rpc-session-incoming-calls.interface";
import type {
	IRpcSessionInvocations,
	RpcSessionInvocationsFactory,
} from "@/interfaces/session/rpc-session-invocations.interface";
import type {
	RpcActiveRecord,
	RpcJsonRecord,
	RpcMessageEnvelope,
	RpcSemanticMessage,
} from "@/types/protocol/rpc-wire-record.type";
import { rpcSecurityCarriersEqual } from "@/utils/protocol/rpc-base64-url-32-schema.util";
import {
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "@/utils/rpc-session-retained-bytes.util";

export type CreateRpcSessionOptions = Parameters<RpcSessionFactory>[0];

/** Retains one Session Incarnation independently from its current Connection. */
export class RpcSessionImpl implements IRpcSession {
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _codec: IRpcCodec;
	readonly _createActivity: RpcSessionActivityFactory;
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
	readonly _callRetention: IRpcSessionCallRetention;
	readonly _incomingCalls: IRpcSessionIncomingCalls;
	readonly _invocations: IRpcSessionInvocations;
	readonly _controlQueue: IRpcQueuedSemantic[] = [];
	_nextSequencedLane: "control" | "data" = "control";
	_ackDirty = false;
	_ackDue = false;
	_ackTimer: ReturnType<typeof setTimeout> | undefined;
	_activity: IRpcSessionActivity | undefined;
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
			createActivity,
			createCallRetention,
			createIncomingCalls,
			createInvocations,
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
		this._createActivity = createActivity;
		this._callRetention = createCallRetention({
			codec,
			policy: host.policy,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
		});
		this._incomingCalls = createIncomingCalls({
			retention: this._callRetention,
			normalizeApplicationArguments: (args) =>
				host.normalizeApplicationArguments(args),
			isDraining: () => this._draining,
			reserveIncomingCall: (request, consume) => {
				const sessionHost = this._sessionHost;
				if (sessionHost === undefined) {
					throw new Error("Default RPC Session has no Framework host.");
				}
				return sessionHost.reserveIncomingCall(request, consume);
			},
			onTerminal: (replay) => this._queueReplay(replay),
			onFault: (error) => this._fault(RpcCloseReasonEnum.resourceFault, error),
		});
		this._invocations = createInvocations({
			codec,
			policy: host.policy,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			reserveReplay: (message) => this._callRetention.reserveReplay(message),
			normalizeApplicationValue: (value) =>
				host.normalizeApplicationValue(value),
			onReady: () => this._pump(),
			onRetired: () => this._checkGracefulShutdown(),
			onCancel: (callId) => {
				this._queueSemantic(
					Object.freeze({
						kind: RpcWireRecordKindEnum.cancel,
						callId,
					}),
				);
			},
			onFault: (reason, error) => this._fault(reason, error),
			onCounterExhausted: () => this._beginCounterDrain(),
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

		this._stopActivity();
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
		this._startActivity(binding);
		// Exit bootstrap activation before replay can reenter the peer's reply gate.
		queueMicrotask(() => this._pump());
		return this._binding === binding && !this._closed;
	}

	_receiveBinding(binding: RpcSessionBindingImpl, bytes: Uint8Array): void {
		if (this._closed) {
			return;
		}
		// Ingress is accepted only from the active current binding of an open Session.
		const bindingCannotReceive = this._binding !== binding || !binding._active;
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
				this._recordInboundActivity(binding, record.kind);
			}
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.ping) {
			this._recordInboundActivity(binding, record.kind);
			this._pump();
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.pong) {
			this._recordInboundActivity(binding, record.kind);
			return;
		}
		if (record.kind === RpcWireRecordKindEnum.close) {
			this._terminalFromPeer(binding);
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
			this._recordInboundActivity(binding, record.kind);
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
		if (this._closed || this._draining) {
			return undefined;
		}
		return this._invocations.prepareInvocation(request, finish);
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
		this._completeTerminal({ kind: "framework-force" });
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
			this._incomingCalls.receiveCall(message);
			return;
		}
		if (message.kind === RpcWireRecordKindEnum.cancel) {
			this._incomingCalls.receiveCancel(message.callId);
			return;
		}
		this._invocations.receiveTerminal(message);
	}

	_queueReplay(replay: IRpcReplayReservation): void {
		if (this._closed) {
			replay.release();
			return;
		}
		this._controlQueue.push({ message: replay.message, replay });
		this._pump();
	}

	_queueSemantic(message: RpcSemanticMessage): boolean {
		if (this._closed) {
			return false;
		}
		const replay = this._callRetention.reserveReplay(message);
		if (replay === undefined) {
			return false;
		}
		this._queueReplay(replay);
		return true;
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

		const hasReplay = this._callRetention.hasReplayBarrier;
		const control = this._controlQueue[0];
		const hasPending = this._invocations.hasPending;
		const activity = this._activity;
		const probeDue = activity?.hasPendingProbe === true;
		const ackDue = this._ackDue && this._ackDirty;
		const nonProbeDue =
			hasReplay || control !== undefined || hasPending || ackDue;
		if (probeDue && (!this._probeSentLast || !nonProbeDue)) {
			const probe = activity.takeProbe();
			if (probe !== undefined) {
				this._probeSentLast = true;
				this._sendUnsequenced(binding, { kind: probe });
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
			(!hasPending || this._nextSequencedLane === "control");
		if (shouldSendControl) {
			this._controlQueue.shift();
			this._nextSequencedLane = "data";
			this._probeSentLast = false;
			this._admitSemantic(binding, control);
			return;
		}
		if (hasPending) {
			this._nextSequencedLane = "control";
			this._probeSentLast = false;
			this._admitNextInvocation(binding);
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

	_admitNextInvocation(binding: RpcSessionBindingImpl): void {
		if (this._nextOutgoingSequence > RPC_LAST_ORDINARY_SEQUENCE) {
			this._beginCounterDrain();
			return;
		}
		const sequence = this._nextOutgoingSequence;
		this._invocations.admitNext({
			sequence,
			ackThrough: this._ackDirty ? this._receivedThrough : undefined,
			commitAndSend: (encoded, replay) => {
				// The Invocation has preflighted and committed its Call Identity. Keep
				// shared delivery identity, replay custody, and send in this same turn.
				this._nextOutgoingSequence += 1;
				this._highestSentSequence = sequence;
				this._callRetention.commitReplay(sequence, replay);
				this._consumePiggybackAck();
				this._sendEncoded(binding, encoded);
			},
		});
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
		this._invocations.rejectPending();
		this._checkGracefulShutdown();
	}

	_enterRecovery(cause?: Error): void {
		if (this._closed) {
			return;
		}
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
		const binding = this._binding;
		this._binding = undefined;
		const recoveryDeadlineAtLoss =
			this._recoveryTimer === undefined
				? Date.now() + this._host.policy.recoveryGraceMs
				: undefined;
		this._stopActivity();
		this._deferDirectClose(binding?._endpoint);
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
		this._completeTerminal({
			kind: "session-closed",
			reason: RpcCloseReasonEnum.recoveryExpired,
		});
	}

	_terminateRetainedSession(
		reason:
			| RpcCloseReasonEnum.continuityFailure
			| RpcCloseReasonEnum.counterExhaustion
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.remoteTerminated,
		cause?: Error,
	): void {
		this._completeTerminal({
			kind: "session-closed",
			reason,
			cause,
		});
	}

	_terminalFromPeer(binding: RpcSessionBindingImpl): void {
		const bindingIsStale =
			this._binding !== binding || !binding._active || this._closed;
		if (bindingIsStale) {
			return;
		}
		this._completeTerminal({
			kind: "session-closed",
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
	}

	_completeTerminal(terminal: SessionTerminalCause): void {
		if (this._closed) {
			return;
		}
		const binding = this._binding;
		this._closed = true;
		this._binding = undefined;
		try {
			this._clearTimers();
			this._invocations.terminate();
			this._incomingCalls.terminate();
			this._releaseReplayState();
			this._protectedRetainedBytesReservation.release();
			unregisterRpcSessionRetainedBytes(this);
			this._resumeToken = undefined;
		} finally {
			try {
				binding?._endpoint.fenceAndClose();
			} catch {
				// Terminal Direct Close is best-effort after Session state is committed.
			} finally {
				try {
					if (terminal.kind === "session-closed") {
						this._sessionHost?.transition({
							type: RpcProtocolSessionTransitionTypeEnum.closed,
							reason: terminal.reason,
							...(terminal.cause === undefined
								? {}
								: { cause: terminal.cause }),
						});
					}
				} finally {
					try {
						this._onTerminal();
					} finally {
						const resolveShutdown = this._resolveShutdown;
						this._resolveShutdown = undefined;
						resolveShutdown?.();
					}
				}
			}
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
		this._stopActivity();
		this._recoveryDeadline = undefined;
	}

	_startActivity(binding: RpcSessionBindingImpl): void {
		this._stopActivity();
		const activity = this._createActivity({
			policy: this._host.policy,
			onProbeDue: () => {
				if (this._binding === binding && !this._closed) {
					this._pump();
				}
			},
			onSilent: () => {
				if (this._binding === binding && !this._closed) {
					this._enterRecovery(new Error("Default RPC binding became silent."));
				}
			},
		});
		this._activity = activity;
		activity.start();
	}

	_recordInboundActivity(
		binding: RpcSessionBindingImpl,
		kind: RpcActiveRecord["kind"],
	): void {
		// Validation can reenter the Session; only the surviving binding owns activity.
		const bindingIsStale =
			this._binding !== binding || !binding._active || this._closed;
		if (bindingIsStale) {
			return;
		}
		this._activity?.recordInbound(kind);
	}

	_stopActivity(): void {
		const activity = this._activity;
		this._activity = undefined;
		activity?.stop();
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
			this._invocations.hasActive ||
			this._incomingCalls.hasActive ||
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

type SessionTerminalCause =
	| { readonly kind: "framework-force" }
	| {
			readonly kind: "session-closed";
			readonly reason:
				| RpcCloseReasonEnum.remoteTerminated
				| RpcCloseReasonEnum.recoveryExpired
				| RpcCloseReasonEnum.continuityFailure
				| RpcCloseReasonEnum.counterExhaustion
				| RpcCloseReasonEnum.forcedClose;
			readonly cause?: Error;
	  };

type RpcSessionImplDependencies = Readonly<{
	readonly codec: IRpcCodec;
	readonly createActivity: RpcSessionActivityFactory;
	readonly createCallRetention: RpcSessionCallRetentionFactory;
	readonly createIncomingCalls: RpcSessionIncomingCallsFactory;
	readonly createInvocations: RpcSessionInvocationsFactory;
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
