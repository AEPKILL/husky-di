/**
 * @overview Retained husky-di-rpc/1 Logical Session, call, sequence, ACK, and replay state.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	RPC_PROFILE,
	RPC_PROTECTED_SESSION_BYTES,
	RPC_RECEIVE_SLOT_BYTES,
} from "@/constants/protocol/rpc-profile.const";
import { RPC_WIRE_FAILURE_MESSAGES } from "@/constants/protocol/rpc-wire-failure-message.const";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcPeerCursorClassificationEnum } from "@/enums/protocol/rpc-peer-cursor-classification.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type {
	IRpcApplicationSnapshot,
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingStream,
	IRpcProtocolInvocation,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolSessionHost,
	IRpcProtocolSourceEmissionReservation,
	IRpcProtocolSourceSink,
	IRpcProtocolStream,
	IRpcProtocolStreamReservation,
	IRpcProtocolSubscriberSink,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolStreamRequest,
	RpcSourceTerminal,
	RpcStreamOutcome,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcRetainedBytesLedger } from "@/interfaces/protocol/rpc-retained-bytes-ledger.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";
import type {
	CreateRpcSessionImplOptions,
	RpcBindingCandidate,
	RpcBindingCommit,
	RpcBindingEpoch,
	RpcContinuityCandidate,
	RpcInitiatorBindingPreparation,
	RpcInitiatorResume,
	RpcInitiatorResumeAccept,
	RpcResponderProof,
	RpcResponderResumeRequest,
	RpcResponderResumeReview,
	RpcSessionAuthorityCommit,
	RpcSessionRecovery,
} from "@/types/protocol/rpc-session.type";
import type {
	RpcActiveRecord,
	RpcCallMessage,
	RpcErrorMessage,
	RpcJsonRecord,
	RpcMessageEnvelope,
	RpcResultMessage,
	RpcSemanticMessage,
	RpcStreamCancelMessage,
	RpcStreamCompleteMessage,
	RpcStreamCreditMessage,
	RpcStreamErrorMessage,
	RpcStreamItemMessage,
	RpcStreamMethodStartMessage,
	RpcStreamPropertyStartMessage,
	RpcStreamWireErrorCode,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";
import {
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "@/utils/rpc-session-retained-bytes.util";

const RPC_SEQUENCE_RESERVE = 512;
const RPC_LAST_ORDINARY_SEQUENCE =
	Number.MAX_SAFE_INTEGER - RPC_SEQUENCE_RESERVE;

type RpcSessionCandidateFacts<TKey> = Readonly<{
	readonly binding: RpcBindingEpochImpl<TKey> | undefined;
	readonly bindingEpoch: number;
	readonly highestSentSequence: number;
	readonly peerReceivedThrough: number;
	readonly proofKey: TKey;
	readonly receivedThrough: number;
	readonly recovering: boolean;
	readonly recoveryDeadline: number | undefined;
}>;

type RpcBindingCandidateFacts<TKey> = Readonly<{
	readonly facts: RpcSessionCandidateFacts<TKey>;
	readonly host?: IRpcProtocolSessionHost;
	readonly kind: "fresh" | "initiator-resume" | "responder-resume";
	readonly nextBindingEpoch: number;
	readonly peerReceivedThrough: number;
	readonly resumeAttempt?: number;
}>;

type RpcContinuityCandidateFacts<TKey> = Readonly<{
	readonly facts: RpcSessionCandidateFacts<TKey>;
	readonly peerReceivedThrough?: number;
	readonly resumeAttempt?: number;
	readonly source: "initiator" | "responder";
}>;

type RpcInitiatorResumeFacts<TKey> = Readonly<{
	readonly facts: RpcSessionCandidateFacts<TKey>;
	readonly resumeAttempt: number;
}>;

/** Exact authority for one installed Physical Connection Binding Epoch. */
class RpcBindingEpochImpl<TKey> {
	readonly _session: RpcSessionImpl<TKey>;
	readonly _endpoint: IRpcEndpoint;
	_active = false;
	_activationAttempted = false;

	constructor(session: RpcSessionImpl<TKey>, endpoint: IRpcEndpoint) {
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

	failed(reason: RpcEndpointFailureEnum, error?: Error): void {
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

interface IRpcInvocationEntry {
	request?: IRpcProtocolInvocationRequest;
	readonly sink: IRpcProtocolInvocationSink;
	readonly pendingCharge: number;
	retainedBytesReservation?: IRpcRetainedBytesReservation;
	pendingCharged: boolean;
	started: boolean;
	admitted: boolean;
	publicFinished: boolean;
	retired: boolean;
	callId?: string;
}

interface IRpcIncomingEntry {
	readonly callId: string;
	call?: IRpcProtocolIncomingCall;
	terminalSequence?: number;
	terminalSelected: boolean;
}

interface IRpcOutgoingStreamEntry {
	request?: RpcProtocolStreamRequest;
	readonly sink: IRpcProtocolSubscriberSink;
	readonly pendingCharge: number;
	retainedBytesReservation?: IRpcRetainedBytesReservation;
	receiveSlotReservation?: IRpcRetainedBytesReservation;
	pendingCharged: boolean;
	started: boolean;
	admitted: boolean;
	publicFinished: boolean;
	retired: boolean;
	streamId?: string;
	nextItemOrdinal: number;
	itemOrdinalExhausted: boolean;
	creditThrough: number;
}

interface IRpcIncomingStreamEntry {
	readonly streamId: string;
	stream?: IRpcProtocolIncomingStream;
	acceptedCreditThrough: number;
	admittedItemCount: number;
	emissionReserved: boolean;
	released: boolean;
	terminalSelected: boolean;
	terminalSequence?: number;
}

interface IRpcReplayEntry {
	readonly message: RpcSemanticMessage;
	readonly charge: number;
	readonly retainedBytesReservation?: IRpcRetainedBytesReservation;
	readonly resourceClass: "ordinary" | "terminal" | "cancel";
	released: boolean;
}

interface IRpcQueuedSemantic {
	readonly message: RpcSemanticMessage;
	readonly replay: IRpcReplayEntry;
	readonly ordinaryFuture: boolean;
}

interface IRpcTransferredReplayCapacity {
	readonly charge: number;
	readonly reservation: IRpcRetainedBytesReservation;
}

/** Retains one Session Incarnation independently from its current Connection. */
export class RpcSessionImpl<TKey = CryptoKey> implements IRpcSession<TKey> {
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _codec: IRpcCodec;
	readonly _onTerminal: () => void;
	readonly _retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly _protectedRetainedBytesReservation: IRpcRetainedBytesReservation;
	readonly _bindingCandidates = new WeakMap<
		object,
		RpcBindingCandidateFacts<TKey>
	>();
	readonly _continuityCandidates = new WeakMap<
		object,
		RpcContinuityCandidateFacts<TKey>
	>();
	readonly _initiatorResumeCandidates = new WeakMap<
		object,
		RpcInitiatorResumeFacts<TKey>
	>();
	readonly _responderProofCandidates = new WeakMap<object, TKey>();
	_proofKey: TKey | undefined;
	_sessionHost: IRpcProtocolSessionHost | undefined;
	_binding: RpcBindingEpochImpl<TKey> | undefined;
	_bindingEpoch = 0;
	_resumeAttempt = 0;
	_highestAcceptedResumeAttempt = 0;
	_recoveryDeadline: number | undefined;
	_nextOutgoingSequence = 1;
	_outgoingSequenceExhausted = false;
	_highestSentSequence = 0;
	_receivedThrough = 0;
	readonly _receivedFingerprints = new Map<number, RpcSemanticMessage>();
	_peerReceivedThrough = 0;
	_nextOutgoingCallOrdinal = 1;
	_outgoingCallOrdinalExhausted = false;
	_highestIncomingCallOrdinal = 0;
	_nextOutgoingStreamOrdinal = 1;
	_outgoingStreamOrdinalExhausted = false;
	_highestIncomingStreamOrdinal = 0;
	_invocationCount = 0;
	_pendingInvocationBytes = 0;
	readonly _invocations = new Set<IRpcInvocationEntry>();
	readonly _pendingInvocations: IRpcInvocationEntry[] = [];
	readonly _outgoingCalls = new Map<string, IRpcInvocationEntry>();
	readonly _incomingCalls = new Map<string, IRpcIncomingEntry>();
	_streamCount = 0;
	_pendingStreamBytes = 0;
	readonly _streams = new Set<IRpcOutgoingStreamEntry>();
	readonly _pendingStreams: IRpcOutgoingStreamEntry[] = [];
	readonly _outgoingStreams = new Map<string, IRpcOutgoingStreamEntry>();
	readonly _incomingStreams = new Map<string, IRpcIncomingStreamEntry>();
	readonly _replay = new Map<number, IRpcReplayEntry>();
	_replayBytes = 0;
	_ordinaryReplayCount = 0;
	_terminalReplayCount = 0;
	_terminalPayloadCount = 0;
	_terminalReplayBytes = 0;
	_cancelReplayCount = 0;
	_ordinaryFutureObligations = 0;
	_replayBarrier: number[] = [];
	readonly _controlQueue: IRpcQueuedSemantic[] = [];
	_nextSequencedLane: "control" | "data" = "control";
	_nextDataKind: "call" | "stream" = "call";
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

	public constructor(options: CreateRpcSessionImplOptions<TKey>) {
		const {
			codec,
			counterExhausted = false,
			host,
			onTerminal,
			proofKey,
			retainedBytesLedger,
			sessionId,
		} = options;
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
		this._proofKey = proofKey;
		this._onTerminal = onTerminal;
		if (counterExhausted) {
			this._nextOutgoingSequence = RPC_LAST_ORDINARY_SEQUENCE + 1;
		}
	}

	get sessionId(): string {
		return this._sessionId;
	}

	get recovery(): RpcSessionRecovery | undefined {
		const reclaimDeadline =
			this._recovering && !this._closed && this._binding === undefined
				? this._recoveryDeadline
				: undefined;
		return reclaimDeadline === undefined
			? undefined
			: Object.freeze({ reclaimDeadline });
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

	prepareFreshBinding(
		host: IRpcProtocolSessionHost,
	): RpcBindingCandidate<TKey> {
		const proofKey = this._proofKey;
		// Fresh binding is legal only for an open, unbound, never-recovered Session.
		const cannotPrepareFreshBinding =
			this._closed ||
			proofKey === undefined ||
			this._sessionHost !== undefined ||
			this._binding !== undefined ||
			this._bindingEpoch !== 0 ||
			this._recovering;
		if (cannotPrepareFreshBinding) {
			throw new Error("Default RPC fresh binding candidate is invalid.");
		}
		const candidate = Object.freeze({}) as RpcBindingCandidate<TKey>;
		this._bindingCandidates.set(candidate, {
			facts: this._snapshotCandidateFacts(proofKey),
			host,
			kind: "fresh",
			nextBindingEpoch: 1,
			peerReceivedThrough: 0,
		});
		return candidate;
	}

	beginInitiatorResume(): RpcInitiatorResume<TKey> {
		const proofKey = this._proofKey;
		const recoveryDeadline = this._recoveryDeadline;
		// Resume requires live retained authority within the active recovery window.
		const sessionIsNotRecoverable =
			this._closed ||
			!this._recovering ||
			this._binding !== undefined ||
			proofKey === undefined ||
			recoveryDeadline === undefined ||
			Date.now() >= recoveryDeadline;
		if (sessionIsNotRecoverable) {
			throw new Error("Default RPC Session is not recoverable.");
		}
		if (this._resumeAttempt >= Number.MAX_SAFE_INTEGER) {
			throw new Error("Default RPC resumeAttempt counter is exhausted.");
		}
		this._resumeAttempt += 1;
		const resume = Object.freeze({
			sessionId: this._sessionId,
			proofKey,
			resumeAttempt: this._resumeAttempt,
			receivedThrough: this._receivedThrough,
		}) as RpcInitiatorResume<TKey>;
		this._initiatorResumeCandidates.set(resume, {
			facts: this._snapshotCandidateFacts(proofKey),
			resumeAttempt: this._resumeAttempt,
		});
		return resume;
	}

	confirmInitiatorResume(resume: RpcInitiatorResume<TKey>): boolean {
		const candidate = this._initiatorResumeCandidates.get(resume);
		return candidate !== undefined && this._initiatorResumeCurrent(candidate);
	}

	prepareInitiatorBinding(
		resume: RpcInitiatorResume<TKey>,
		accept: RpcInitiatorResumeAccept,
	): RpcInitiatorBindingPreparation<TKey> {
		const candidate = this._initiatorResumeCandidates.get(resume);
		this._initiatorResumeCandidates.delete(resume);
		if (candidate === undefined || !this._initiatorResumeCurrent(candidate)) {
			return Object.freeze({
				kind: "stale",
				error: new Error(
					"Default RPC initiator resume candidate became stale.",
				),
			});
		}
		const contradictory =
			accept.profile !== RPC_PROFILE ||
			accept.sessionId !== this._sessionId ||
			!Number.isSafeInteger(accept.bindingEpoch) ||
			accept.bindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(accept.peerReceivedThrough) !==
				RpcPeerCursorClassificationEnum.valid;
		if (contradictory) {
			const contradiction = Object.freeze({
				kind: "contradiction",
			}) as RpcInitiatorBindingPreparation<TKey> & object;
			this._continuityCandidates.set(contradiction, {
				facts: candidate.facts,
				resumeAttempt: candidate.resumeAttempt,
				source: "initiator",
			});
			return contradiction;
		}
		const ready = Object.freeze({
			kind: "ready",
		}) as RpcInitiatorBindingPreparation<TKey> & object;
		this._bindingCandidates.set(ready, {
			facts: candidate.facts,
			kind: "initiator-resume",
			nextBindingEpoch: accept.bindingEpoch,
			peerReceivedThrough: accept.peerReceivedThrough,
			resumeAttempt: candidate.resumeAttempt,
		});
		return ready;
	}

	openResponderProof(): RpcResponderProof<TKey> | undefined {
		const proofKey = this._proofKey;
		if (this._closed || proofKey === undefined) {
			return undefined;
		}
		const proof = Object.freeze({ proofKey }) as RpcResponderProof<TKey>;
		this._responderProofCandidates.set(proof, proofKey);
		return proof;
	}

	reviewResponderResume(
		proof: RpcResponderProof<TKey>,
		request: RpcResponderResumeRequest,
	): RpcResponderResumeReview<TKey> {
		const proofKey = this._responderProofCandidates.get(proof);
		this._responderProofCandidates.delete(proof);
		// A responder proof must retain current Session authority and a newer attempt.
		const responderProofIsInvalid =
			proofKey === undefined ||
			this._closed ||
			this._proofKey !== proofKey ||
			!this._canAcceptResumeAttempt(request.resumeAttempt);
		if (responderProofIsInvalid) {
			return Object.freeze({ kind: "generic-reject" });
		}
		const facts = this._snapshotCandidateFacts(proofKey);
		if (
			this._classifyPeerCursor(request.peerReceivedThrough) !==
			RpcPeerCursorClassificationEnum.valid
		) {
			const continuity = Object.freeze({
				kind: "continuity-reject",
				proofKey,
			}) as RpcResponderResumeReview<TKey> & object;
			this._continuityCandidates.set(continuity, {
				facts,
				peerReceivedThrough: request.peerReceivedThrough,
				resumeAttempt: request.resumeAttempt,
				source: "responder",
			});
			return continuity;
		}
		const accept = Object.freeze({
			kind: "accept",
			proofKey,
			bindingEpoch: this._bindingEpoch + 1,
			receivedThrough: this._receivedThrough,
		}) as RpcResponderResumeReview<TKey> & object;
		this._bindingCandidates.set(accept, {
			facts,
			kind: "responder-resume",
			nextBindingEpoch: this._bindingEpoch + 1,
			peerReceivedThrough: request.peerReceivedThrough,
			resumeAttempt: request.resumeAttempt,
		});
		return accept;
	}

	commitContinuityFailure(
		candidate: RpcContinuityCandidate<TKey> | RpcInitiatorResume<TKey>,
		cause?: Error,
	): RpcSessionAuthorityCommit {
		const continuity = this._continuityCandidates.get(candidate);
		this._continuityCandidates.delete(candidate);
		if (continuity !== undefined) {
			const current =
				this._candidateFactsCurrent(continuity.facts) &&
				(continuity.source === "initiator"
					? continuity.resumeAttempt === this._resumeAttempt &&
						this._initiatorRecoveryCurrent(continuity.facts)
					: continuity.resumeAttempt !== undefined &&
						continuity.peerReceivedThrough !== undefined &&
						this._canAcceptResumeAttempt(continuity.resumeAttempt) &&
						this._classifyPeerCursor(continuity.peerReceivedThrough) !==
							RpcPeerCursorClassificationEnum.valid);
			if (current) {
				this._terminateRetainedSession(
					RpcCloseReasonEnum.continuityFailure,
					cause,
				);
				return Object.freeze({ kind: "committed" });
			}
		}

		const resume = this._initiatorResumeCandidates.get(candidate);
		this._initiatorResumeCandidates.delete(candidate);
		if (resume !== undefined && this._initiatorResumeCurrent(resume)) {
			this._terminateRetainedSession(
				RpcCloseReasonEnum.continuityFailure,
				cause,
			);
			return Object.freeze({ kind: "committed" });
		}
		return Object.freeze({
			kind: "discarded",
			error: new Error("Default RPC continuity candidate became stale."),
		});
	}

	terminateAuthenticatedRemote(
		resume: RpcInitiatorResume<TKey>,
		cause?: Error,
	): RpcSessionAuthorityCommit {
		const candidate = this._initiatorResumeCandidates.get(resume);
		this._initiatorResumeCandidates.delete(resume);
		if (candidate === undefined || !this._initiatorResumeCurrent(candidate)) {
			return Object.freeze({
				kind: "discarded",
				error: new Error(
					"Default RPC authenticated terminal candidate became stale.",
				),
			});
		}
		this._terminateRetainedSession(RpcCloseReasonEnum.remoteTerminated, cause);
		return Object.freeze({ kind: "committed" });
	}

	terminateForced(): void {
		this._terminateRetainedSession(RpcCloseReasonEnum.forcedClose);
	}

	commitBinding(
		candidate: RpcBindingCandidate<TKey>,
		endpoint: IRpcEndpoint,
	): RpcBindingCommit {
		const prepared = this._bindingCandidates.get(candidate);
		this._bindingCandidates.delete(candidate);
		const stale =
			prepared === undefined
				? "Default RPC binding candidate is unknown or already consumed."
				: this._validateBindingCandidate(prepared, endpoint);
		if (prepared === undefined || stale !== undefined) {
			return Object.freeze({
				kind: "discarded",
				error: new Error(
					stale ??
						"Default RPC binding candidate is unknown or already consumed.",
				),
			});
		}

		const binding = new RpcBindingEpochImpl(this, endpoint);
		try {
			endpoint.configureSendProgressTimeout(
				this._host.policy.sendProgressTimeoutMs,
			);
			endpoint.observeIngressIdle(() => this._bindingIngressIdle(binding));
		} catch (error) {
			return Object.freeze({
				kind: "discarded",
				error:
					error instanceof Error
						? error
						: new Error("Default RPC binding Endpoint setup failed."),
			});
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
		this._applyAck(prepared.peerReceivedThrough, false);
		this._replayBarrier = [...this._replay.keys()].filter(
			(sequence) => sequence > prepared.peerReceivedThrough,
		);
		this._binding = binding;
		if (prepared.kind === "responder-resume") {
			this._cancelRecoveryDeadline();
		}
		this._checkGracefulShutdown();
		this._deferDirectClose(previousBinding?._endpoint);
		return Object.freeze({
			kind: "installed",
			binding: binding as unknown as RpcBindingEpoch,
		});
	}

	_reserveBindingRetainedBytes(
		binding: RpcBindingEpochImpl<TKey>,
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this._binding === binding && !this._closed
			? this.reserveRetainedBytes(bytes)
			: undefined;
	}

	_activateBinding(binding: RpcBindingEpochImpl<TKey>): boolean {
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
		this._pump();
		return this._binding === binding && !this._closed;
	}

	_receiveBinding(binding: RpcBindingEpochImpl<TKey>, bytes: Uint8Array): void {
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
		binding: RpcBindingEpochImpl<TKey>,
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

	_bindingIngressIdle(binding: RpcBindingEpochImpl<TKey>): void {
		if (this._binding !== binding || this._closed) {
			return;
		}
		this._pump();
		this._checkGracefulShutdown();
	}

	_snapshotCandidateFacts(proofKey: TKey): RpcSessionCandidateFacts<TKey> {
		return Object.freeze({
			binding: this._binding,
			bindingEpoch: this._bindingEpoch,
			highestSentSequence: this._highestSentSequence,
			peerReceivedThrough: this._peerReceivedThrough,
			proofKey,
			receivedThrough: this._receivedThrough,
			recovering: this._recovering,
			recoveryDeadline: this._recoveryDeadline,
		});
	}

	_candidateFactsCurrent(facts: RpcSessionCandidateFacts<TKey>): boolean {
		return (
			!this._closed &&
			this._proofKey === facts.proofKey &&
			this._binding === facts.binding &&
			this._bindingEpoch === facts.bindingEpoch &&
			this._highestSentSequence === facts.highestSentSequence &&
			this._peerReceivedThrough === facts.peerReceivedThrough &&
			this._receivedThrough === facts.receivedThrough &&
			this._recovering === facts.recovering &&
			this._recoveryDeadline === facts.recoveryDeadline
		);
	}

	_initiatorRecoveryCurrent(facts: RpcSessionCandidateFacts<TKey>): boolean {
		return (
			facts.recovering &&
			facts.binding === undefined &&
			facts.recoveryDeadline !== undefined &&
			Date.now() < facts.recoveryDeadline
		);
	}

	_initiatorResumeCurrent(candidate: RpcInitiatorResumeFacts<TKey>): boolean {
		return (
			candidate.resumeAttempt === this._resumeAttempt &&
			this._candidateFactsCurrent(candidate.facts) &&
			this._initiatorRecoveryCurrent(candidate.facts)
		);
	}

	_validateBindingCandidate(
		candidate: RpcBindingCandidateFacts<TKey>,
		endpoint: IRpcEndpoint,
	): string | undefined {
		if (!this._candidateFactsCurrent(candidate.facts)) {
			return "Default RPC binding candidate became stale.";
		}
		if (this._binding?._endpoint === endpoint) {
			return "Default RPC binding candidate reused its current Endpoint.";
		}
		// Binding continuity requires a safe newer epoch and a valid peer cursor.
		const continuityIsInvalid =
			!Number.isSafeInteger(candidate.nextBindingEpoch) ||
			candidate.nextBindingEpoch <= this._bindingEpoch ||
			this._classifyPeerCursor(candidate.peerReceivedThrough) !==
				RpcPeerCursorClassificationEnum.valid;
		if (continuityIsInvalid) {
			return "Default RPC binding candidate contradicts retained continuity.";
		}
		if (candidate.kind === "fresh") {
			return this._sessionHost === undefined &&
				candidate.host !== undefined &&
				candidate.nextBindingEpoch === 1 &&
				candidate.peerReceivedThrough === 0 &&
				this._bindingEpoch === 0 &&
				this._binding === undefined &&
				!this._recovering
				? undefined
				: "Default RPC fresh binding candidate became stale.";
		}
		if (candidate.kind === "initiator-resume") {
			return candidate.resumeAttempt === this._resumeAttempt &&
				this._initiatorRecoveryCurrent(candidate.facts)
				? undefined
				: "Default RPC initiator binding candidate became stale.";
		}
		return candidate.resumeAttempt !== undefined &&
			this._canAcceptResumeAttempt(candidate.resumeAttempt) &&
			candidate.nextBindingEpoch === this._bindingEpoch + 1
			? undefined
			: "Default RPC responder binding candidate became stale.";
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
			this._proofKey !== undefined &&
			resumeAttempt > this._highestAcceptedResumeAttempt &&
			(!this._recovering ||
				this._binding !== undefined ||
				(this._recoveryDeadline !== undefined &&
					Date.now() < this._recoveryDeadline)) &&
			this._bindingEpoch < Number.MAX_SAFE_INTEGER
		);
	}

	reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		const pendingCharge = request.args.weight + 256;
		const maximumPendingBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		// Pending invocation admission requires an active Session and count/byte capacity.
		const cannotReserveInvocation =
			this._closed ||
			this._draining ||
			this._invocationCount + this._streamCount >=
				this._host.policy.maxApplicationWorkPerSession ||
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
		let reservationState: "reserved" | "committed" | "released" = "reserved";
		let entry: IRpcInvocationEntry | undefined;
		return Object.freeze({
			commit: (sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation => {
				if (reservationState !== "reserved") {
					this._fault(
						RpcCloseReasonEnum.protocolFault,
						new Error(
							"Default RPC invocation reservation had multiple winners.",
						),
					);
					return Object.freeze({ start() {}, cancel() {} });
				}
				reservationState = "committed";
				entry = {
					request,
					sink,
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
					start: () => this._startInvocation(entry as IRpcInvocationEntry),
					cancel: () => this._cancelInvocation(entry as IRpcInvocationEntry),
				});
			},
			release: (): void => {
				if (reservationState !== "reserved") {
					this._fault(
						RpcCloseReasonEnum.protocolFault,
						new Error(
							"Default RPC invocation reservation had multiple winners.",
						),
					);
					return;
				}
				reservationState = "released";
				this._invocationCount -= 1;
				this._pendingInvocationBytes -= pendingCharge;
				retainedBytesReservation.release();
			},
		});
	}

	reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		const pendingCharge =
			(request.kind === "stream-method" ? request.args.weight : 0) + 256;
		const maximumPendingBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		const cannotReserveStream =
			this._closed ||
			this._draining ||
			this._streamCount >= this._host.policy.maxActiveStreamsPerSession ||
			this._streamCount + this._invocationCount >=
				this._host.policy.maxApplicationWorkPerSession ||
			!Number.isSafeInteger(pendingCharge) ||
			pendingCharge > maximumPendingBytes - this._pendingStreamBytes;
		if (cannotReserveStream) {
			return undefined;
		}
		const retainedBytesReservation = this.reserveRetainedBytes(pendingCharge);
		if (retainedBytesReservation === undefined) {
			return undefined;
		}
		const receiveSlotReservation = this.reserveRetainedBytes(
			RPC_RECEIVE_SLOT_BYTES,
		);
		if (receiveSlotReservation === undefined) {
			retainedBytesReservation.release();
			return undefined;
		}
		this._streamCount += 1;
		this._pendingStreamBytes += pendingCharge;
		let reservationState: "reserved" | "committed" | "released" = "reserved";
		let entry: IRpcOutgoingStreamEntry | undefined;
		return Object.freeze({
			commit: (sink: IRpcProtocolSubscriberSink): IRpcProtocolStream => {
				if (reservationState !== "reserved") {
					this._fault(
						RpcCloseReasonEnum.protocolFault,
						new Error("Default RPC stream reservation had multiple winners."),
					);
					return Object.freeze({ start() {}, cancel() {} });
				}
				reservationState = "committed";
				entry = {
					request,
					sink,
					pendingCharge,
					retainedBytesReservation,
					receiveSlotReservation,
					pendingCharged: true,
					started: false,
					admitted: false,
					publicFinished: false,
					retired: false,
					nextItemOrdinal: 1,
					itemOrdinalExhausted: false,
					creditThrough: 1,
				};
				this._streams.add(entry);
				return Object.freeze({
					start: () => this._startStream(entry as IRpcOutgoingStreamEntry),
					cancel: () => this._cancelStream(entry as IRpcOutgoingStreamEntry),
				});
			},
			release: (): void => {
				if (reservationState !== "reserved") {
					this._fault(
						RpcCloseReasonEnum.protocolFault,
						new Error("Default RPC stream reservation had multiple winners."),
					);
					return;
				}
				reservationState = "released";
				this._streamCount -= 1;
				this._pendingStreamBytes -= pendingCharge;
				retainedBytesReservation.release();
				receiveSlotReservation.release();
			},
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
			const retained = this._receivedFingerprints.get(envelope.seq);
			if (
				retained !== undefined &&
				!rpcJsonValuesEqual(retained, envelope.message)
			) {
				this._fault(
					RpcCloseReasonEnum.protocolFault,
					new Error("Default RPC duplicate sequence equivocates."),
				);
				return false;
			}
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

		let effect: (() => void) | undefined;
		try {
			effect = this._dispatchSemantic(envelope.message);
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
		this._receivedFingerprints.set(envelope.seq, envelope.message);
		this._receivedThrough = envelope.seq;
		try {
			effect?.();
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC semantic effect failed."),
			);
			return false;
		}
		this._markAckDirty();
		return true;
	}

	_dispatchSemantic(message: RpcSemanticMessage): (() => void) | undefined {
		switch (message.kind) {
			case RpcWireRecordKindEnum.call:
				return this._receiveCall(message);
			case RpcWireRecordKindEnum.cancel:
				return this._receiveCancel(message.callId);
			case RpcWireRecordKindEnum.result:
				return this._receiveResult(message);
			case RpcWireRecordKindEnum.error:
				return this._receiveError(message);
			case RpcWireRecordKindEnum.streamMethod:
			case RpcWireRecordKindEnum.streamProperty:
				return this._receiveStreamStart(message);
			case RpcWireRecordKindEnum.streamItem:
				return this._receiveStreamItem(message);
			case RpcWireRecordKindEnum.streamCredit:
				return this._receiveStreamCredit(message);
			case RpcWireRecordKindEnum.streamCancel:
				return this._receiveStreamCancel(message);
			case RpcWireRecordKindEnum.streamComplete:
			case RpcWireRecordKindEnum.streamError:
				return this._receiveStreamTerminal(message);
		}
	}

	_receiveCall(message: RpcCallMessage): (() => void) | undefined {
		const args = this._host.normalizeApplicationArguments(message.args);
		const ordinal = Number(message.callId);
		if (ordinal !== this._highestIncomingCallOrdinal + 1) {
			throw new Error("Default RPC Call Ordinal is not contiguous.");
		}
		const sessionHost = this._sessionHost;
		if (sessionHost === undefined) {
			throw new Error("Default RPC Session has no Framework host.");
		}
		if (this._draining || this._incomingCalls.size >= 256) {
			this._highestIncomingCallOrdinal = ordinal;
			return () =>
				this._queueError(message.callId, RpcExceptionCodeEnum.unavailable);
		}
		const reservation = sessionHost.reserveIncomingCall({
			service: message.service,
			member: message.member,
			args,
		});
		this._highestIncomingCallOrdinal = ordinal;
		if (reservation === undefined) {
			this._incomingCalls.set(message.callId, {
				callId: message.callId,
				terminalSelected: true,
			});
			return () =>
				this._queueError(message.callId, RpcExceptionCodeEnum.unavailable);
		}

		if (reservation.kind === RpcIncomingCallKindEnum.unknown) {
			const entry: IRpcIncomingEntry = {
				callId: message.callId,
				terminalSelected: true,
			};
			this._incomingCalls.set(message.callId, entry);
			return () => {
				const incoming = reservation.reservation.commit();
				entry.call = incoming;
				this._finishIncomingCall(
					entry,
					this._closed
						? { type: RpcCallTerminalTypeEnum.sessionTerminated }
						: {
								type: RpcCallTerminalTypeEnum.failed,
								code: reservation.code,
							},
				);
				if (!this._closed) {
					this._queueError(message.callId, reservation.code);
				}
			};
		}

		const entry: IRpcIncomingEntry = {
			callId: message.callId,
			terminalSelected: false,
		};
		this._incomingCalls.set(message.callId, entry);
		return () => {
			const incoming = reservation.reservation.commit();
			entry.call = incoming;
			if (this._closed) {
				this._finishIncomingCall(entry, {
					type: RpcCallTerminalTypeEnum.sessionTerminated,
				});
				return;
			}
			void incoming.handlerOutcome.then(
				(outcome) => this._finishIncomingHandler(entry, outcome),
				() =>
					this._finishIncomingHandler(entry, {
						type: RpcCallTerminalTypeEnum.failed,
						code: RpcExceptionCodeEnum.handlerFailed,
					}),
			);
		};
	}

	_receiveCancel(callId: string): (() => void) | undefined {
		const incoming = this._incomingCalls.get(callId);
		if (incoming === undefined) {
			if (Number(callId) > this._highestIncomingCallOrdinal) {
				throw new Error("Default RPC cancel refers to a future Call Ordinal.");
			}
			return undefined;
		}
		if (incoming.terminalSelected || incoming.call === undefined) {
			return undefined;
		}
		incoming.terminalSelected = true;
		return () => {
			this._finishIncomingCall(incoming, {
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.canceled,
			});
			this._queueError(callId, RpcExceptionCodeEnum.canceled);
		};
	}

	_receiveResult(message: RpcResultMessage): (() => void) | undefined {
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
		const shouldFinish = !invocation.publicFinished;
		invocation.publicFinished = true;
		this._retireInvocation(invocation);
		return shouldFinish ? () => invocation.sink.finish(outcome) : undefined;
	}

	_receiveError(message: RpcErrorMessage): (() => void) | undefined {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error("Default RPC error has no matching Logical Call.");
		}
		const outcome: RpcCallOutcome = {
			type: RpcCallTerminalTypeEnum.failed,
			code: message.error.code,
		};
		const shouldFinish = !invocation.publicFinished;
		invocation.publicFinished = true;
		this._retireInvocation(invocation);
		return shouldFinish ? () => invocation.sink.finish(outcome) : undefined;
	}

	_receiveStreamStart(
		message: RpcStreamMethodStartMessage | RpcStreamPropertyStartMessage,
	): (() => void) | undefined {
		const ordinal = Number(message.streamId);
		if (ordinal !== this._highestIncomingStreamOrdinal + 1) {
			throw new Error("Default RPC Stream Ordinal is not contiguous.");
		}
		const request: RpcProtocolStreamRequest =
			message.kind === RpcWireRecordKindEnum.streamMethod
				? {
						kind: "stream-method",
						service: message.service,
						member: message.member,
						args: this._host.normalizeApplicationArguments(message.args),
					}
				: {
						kind: "stream-property",
						service: message.service,
						member: message.member,
					};
		const sessionHost = this._sessionHost;
		if (sessionHost === undefined) {
			throw new Error("Default RPC Session has no Framework host.");
		}
		const incomingActiveCount = [...this._incomingStreams.values()].filter(
			(candidate) => !candidate.released,
		).length;
		this._highestIncomingStreamOrdinal = ordinal;
		const entry: IRpcIncomingStreamEntry = {
			streamId: message.streamId,
			acceptedCreditThrough: 1,
			admittedItemCount: 0,
			emissionReserved: false,
			released: true,
			terminalSelected: false,
		};
		this._incomingStreams.set(message.streamId, entry);
		if (
			this._draining ||
			incomingActiveCount >= this._host.policy.maxActiveStreamsPerSession
		) {
			entry.terminalSelected = true;
			return () =>
				this._queueStreamError(entry, RpcExceptionCodeEnum.unavailable, 0);
		}
		const reservation = sessionHost.reserveIncomingStream(request);
		if (reservation === undefined) {
			entry.terminalSelected = true;
			return () =>
				this._queueStreamError(entry, RpcExceptionCodeEnum.unavailable, 0);
		}
		entry.released = false;
		if (reservation.kind === "unknown") {
			entry.terminalSelected = true;
			return () => {
				const incoming = reservation.reservation.commit();
				entry.stream = incoming;
				this._queueStreamError(entry, reservation.code, 0);
				incoming.finish({ type: "failed", code: reservation.code }, () =>
					this._releaseIncomingStream(entry),
				);
			};
		}
		return () => {
			const incoming = reservation.reservation.commit(
				this._createSourceSink(entry),
			);
			entry.stream = incoming;
			if (this._closed) {
				incoming.finish({ type: "session-terminated" }, () =>
					this._releaseIncomingStream(entry),
				);
			}
		};
	}

	_createSourceSink(entry: IRpcIncomingStreamEntry): IRpcProtocolSourceSink {
		return Object.freeze({
			reserveEmission: ():
				| IRpcProtocolSourceEmissionReservation
				| undefined => {
				if (this._closed || entry.terminalSelected || entry.released) {
					return undefined;
				}
				if (
					entry.emissionReserved ||
					entry.admittedItemCount >= entry.acceptedCreditThrough
				) {
					this._selectIncomingStreamTerminal(entry, {
						type: "failed",
						code: RpcExceptionCodeEnum.overflow,
					});
					return undefined;
				}
				if (!this._canReserveOrdinaryFuture()) {
					this._selectIncomingStreamTerminal(entry, {
						type: "failed",
						code: RpcExceptionCodeEnum.overflow,
					});
					this._beginCounterDrain();
					return undefined;
				}
				const itemCapacity = this.reserveRetainedBytes(RPC_RECEIVE_SLOT_BYTES);
				if (itemCapacity === undefined) {
					this._selectIncomingStreamTerminal(entry, {
						type: "failed",
						code: RpcExceptionCodeEnum.overflow,
					});
					return undefined;
				}
				entry.emissionReserved = true;
				let disposition: "reserved" | "committed" | "failed" = "reserved";
				return Object.freeze({
					commit: (value: IRpcApplicationSnapshot): void => {
						if (disposition !== "reserved") {
							throw new Error(
								"Default RPC Source emission had multiple dispositions.",
							);
						}
						disposition = "committed";
						entry.emissionReserved = false;
						if (entry.terminalSelected || entry.released || this._closed) {
							itemCapacity.release();
							return;
						}
						const itemOrdinal = entry.admittedItemCount + 1;
						const queued = this._queueSemantic(
							Object.freeze({
								kind: RpcWireRecordKindEnum.streamItem,
								streamId: entry.streamId,
								itemOrdinal,
								value: value.value,
							}) as RpcStreamItemMessage,
							{
								charge: value.weight + 256,
								reservation: itemCapacity,
							},
						);
						if (!queued) {
							if (!this._canReserveOrdinaryFuture()) {
								this._beginCounterDrain();
							}
							this._selectIncomingStreamTerminal(entry, {
								type: "failed",
								code: RpcExceptionCodeEnum.overflow,
							});
							return;
						}
						entry.admittedItemCount = itemOrdinal;
					},
					fail: (): void => {
						if (disposition !== "reserved") {
							throw new Error(
								"Default RPC Source emission had multiple dispositions.",
							);
						}
						disposition = "failed";
						entry.emissionReserved = false;
						itemCapacity.release();
						this._selectIncomingStreamTerminal(entry, {
							type: "failed",
							code: RpcExceptionCodeEnum.handlerFailed,
						});
					},
				});
			},
			finish: (outcome: RpcSourceTerminal): void => {
				this._selectIncomingStreamTerminal(
					entry,
					outcome.type === "completed"
						? { type: "completed" }
						: {
								type: "failed",
								code: RpcExceptionCodeEnum.handlerFailed,
							},
				);
			},
		});
	}

	_selectIncomingStreamTerminal(
		entry: IRpcIncomingStreamEntry,
		outcome:
			| { readonly type: "completed" }
			| {
					readonly type: "failed";
					readonly code:
						| RpcExceptionCodeEnum.handlerFailed
						| RpcExceptionCodeEnum.overflow;
			  },
	): void {
		if (entry.terminalSelected || entry.released || this._closed) {
			return;
		}
		entry.terminalSelected = true;
		const boundary = entry.admittedItemCount;
		const queued =
			outcome.type === "completed"
				? this._queueSemantic(
						Object.freeze({
							kind: RpcWireRecordKindEnum.streamComplete,
							streamId: entry.streamId,
							itemThrough: boundary,
						}) as RpcStreamCompleteMessage,
					)
				: this._queueStreamError(entry, outcome.code, boundary);
		if (!queued) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error(
					"Default RPC protected stream terminal reserve is exhausted.",
				),
			);
		}
		entry.stream?.finish(outcome, () => this._releaseIncomingStream(entry));
	}

	_queueStreamError(
		entry: IRpcIncomingStreamEntry,
		code: RpcStreamWireErrorCode,
		itemThrough: number,
	): boolean {
		const queued = this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.streamError,
				streamId: entry.streamId,
				itemThrough,
				error: Object.freeze({
					code,
					message: RPC_WIRE_FAILURE_MESSAGES[code],
				}),
			}) as RpcStreamErrorMessage,
		);
		if (!queued) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error(
					"Default RPC protected stream terminal reserve is exhausted.",
				),
			);
		}
		return queued;
	}

	_releaseIncomingStream(entry: IRpcIncomingStreamEntry): void {
		if (entry.released) {
			return;
		}
		entry.released = true;
		entry.stream = undefined;
		if (
			entry.terminalSequence !== undefined &&
			entry.terminalSequence <= this._peerReceivedThrough
		) {
			this._incomingStreams.delete(entry.streamId);
		}
		this._checkGracefulShutdown();
	}

	_receiveStreamItem(message: RpcStreamItemMessage): (() => void) | undefined {
		const entry = this._outgoingStreams.get(message.streamId);
		if (entry === undefined || entry.retired) {
			throw new Error("Default RPC stream item has no active Subscriber.");
		}
		if (
			entry.itemOrdinalExhausted ||
			message.itemOrdinal !== entry.nextItemOrdinal ||
			message.itemOrdinal > entry.creditThrough
		) {
			throw new Error("Default RPC stream Item Ordinal is not credit-backed.");
		}
		const snapshot = this._host.normalizeApplicationValue(message.value);
		const projection = entry.publicFinished
			? undefined
			: entry.sink.reserveItem(snapshot);
		if (message.itemOrdinal === Number.MAX_SAFE_INTEGER) {
			entry.itemOrdinalExhausted = true;
		} else {
			entry.nextItemOrdinal += 1;
		}
		if (entry.publicFinished) {
			return undefined;
		}
		return () => {
			const effect = projection?.commit();
			if (
				effect !== "rearm" ||
				entry.publicFinished ||
				entry.retired ||
				this._closed
			) {
				return;
			}
			if (entry.creditThrough === Number.MAX_SAFE_INTEGER) {
				return;
			}
			if (!this._canReserveOrdinaryFuture()) {
				const queued = this._queueSemantic(
					Object.freeze({
						kind: RpcWireRecordKindEnum.streamCancel,
						streamId: entry.streamId as string,
					}) as RpcStreamCancelMessage,
				);
				if (!queued) {
					this._fault(
						RpcCloseReasonEnum.resourceFault,
						new Error("Default RPC stream cancel reserve is exhausted."),
					);
					return;
				}
				this._beginCounterDrain();
				return;
			}
			const creditThrough = entry.creditThrough + 1;
			const queued = this._queueSemantic(
				Object.freeze({
					kind: RpcWireRecordKindEnum.streamCredit,
					streamId: entry.streamId as string,
					creditThrough,
				}) as RpcStreamCreditMessage,
			);
			if (!queued) {
				this._fault(
					RpcCloseReasonEnum.resourceFault,
					new Error("Default RPC stream credit could not be retained."),
				);
				return;
			}
			entry.creditThrough = creditThrough;
		};
	}

	_receiveStreamCredit(message: RpcStreamCreditMessage): undefined {
		const entry = this._incomingStreams.get(message.streamId);
		if (entry === undefined) {
			if (Number(message.streamId) > this._highestIncomingStreamOrdinal) {
				throw new Error(
					"Default RPC credit refers to a future Stream Ordinal.",
				);
			}
			return undefined;
		}
		if (message.creditThrough < entry.acceptedCreditThrough) {
			throw new Error("Default RPC stream credit regressed after acceptance.");
		}
		if (entry.terminalSelected) {
			return undefined;
		}
		if (message.creditThrough === entry.acceptedCreditThrough) {
			return undefined;
		}
		if (
			message.creditThrough !== entry.acceptedCreditThrough + 1 ||
			message.creditThrough !== entry.admittedItemCount + 1
		) {
			throw new Error("Default RPC stream credit is regressed or over-credit.");
		}
		entry.acceptedCreditThrough = message.creditThrough;
		return undefined;
	}

	_receiveStreamCancel(
		message: RpcStreamCancelMessage,
	): (() => void) | undefined {
		const entry = this._incomingStreams.get(message.streamId);
		if (entry === undefined) {
			if (Number(message.streamId) > this._highestIncomingStreamOrdinal) {
				throw new Error(
					"Default RPC cancel refers to a future Stream Ordinal.",
				);
			}
			return undefined;
		}
		if (!entry.terminalSelected) {
			entry.terminalSelected = true;
			return () => {
				this._queueStreamError(
					entry,
					RpcExceptionCodeEnum.canceled,
					entry.admittedItemCount,
				);
				entry.stream?.finish({ type: "canceled" }, () =>
					this._releaseIncomingStream(entry),
				);
			};
		}
		return undefined;
	}

	_receiveStreamTerminal(
		message: RpcStreamCompleteMessage | RpcStreamErrorMessage,
	): (() => void) | undefined {
		const entry = this._outgoingStreams.get(message.streamId);
		if (entry === undefined || entry.retired) {
			throw new Error(
				"Default RPC stream terminal has no matching Subscriber.",
			);
		}
		const itemThrough = entry.itemOrdinalExhausted
			? Number.MAX_SAFE_INTEGER
			: entry.nextItemOrdinal - 1;
		if (message.itemThrough !== itemThrough) {
			throw new Error(
				"Default RPC stream terminal boundary is not contiguous.",
			);
		}
		let effect: (() => void) | undefined;
		if (!entry.publicFinished) {
			const outcome: RpcStreamOutcome =
				message.kind === RpcWireRecordKindEnum.streamComplete
					? { type: "completed" }
					: message.error.code === RpcExceptionCodeEnum.canceled
						? { type: "canceled" }
						: {
								type: "failed",
								code: message.error.code,
							};
			const projection = entry.sink.reserveTerminal(outcome);
			entry.publicFinished = true;
			effect = () => projection.commit();
		}
		this._retireOutgoingStream(entry);
		return effect;
	}

	_finishIncomingHandler(
		entry: IRpcIncomingEntry,
		outcome: RpcHandlerOutcome,
	): void {
		// Handler completion applies once while its admitted call remains live.
		const handlerOutcomeIsStale =
			this._closed || entry.terminalSelected || entry.call === undefined;
		if (handlerOutcomeIsStale) {
			return;
		}
		entry.terminalSelected = true;
		let terminal: RpcIncomingTerminal;
		if (outcome.type === RpcCallTerminalTypeEnum.returned) {
			const queued = this._queueSemantic(
				Object.freeze({
					kind: RpcWireRecordKindEnum.result,
					callId: entry.callId,
					value: outcome.value.value,
				}) as RpcResultMessage,
			);
			terminal = queued
				? { type: RpcCallTerminalTypeEnum.returned, value: outcome.value }
				: {
						type: RpcCallTerminalTypeEnum.failed,
						code: RpcExceptionCodeEnum.handlerFailed,
					};
			if (!queued) {
				this._queueError(entry.callId, RpcExceptionCodeEnum.handlerFailed);
			}
		} else if (outcome.type === RpcCallTerminalTypeEnum.returnedVoid) {
			const queued = this._queueSemantic(
				Object.freeze({
					kind: RpcWireRecordKindEnum.result,
					callId: entry.callId,
				}) as RpcResultMessage,
			);
			terminal = queued
				? { type: RpcCallTerminalTypeEnum.returnedVoid }
				: {
						type: RpcCallTerminalTypeEnum.failed,
						code: RpcExceptionCodeEnum.handlerFailed,
					};
			if (!queued) {
				this._queueError(entry.callId, RpcExceptionCodeEnum.handlerFailed);
			}
		} else {
			terminal = {
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.handlerFailed,
			};
			this._queueError(entry.callId, RpcExceptionCodeEnum.handlerFailed);
		}
		this._finishIncomingCall(entry, terminal);
	}

	_finishIncomingCall(
		entry: IRpcIncomingEntry,
		terminal: RpcIncomingTerminal,
	): void {
		const call = entry.call;
		entry.call = undefined;
		call?.finish(terminal);
	}

	_queueError(callId: string, code: RpcWireErrorCode): boolean {
		const queued = this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.error,
				callId,
				error: Object.freeze({
					code,
					message: RPC_WIRE_FAILURE_MESSAGES[code],
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

	_queueSemantic(
		message: RpcSemanticMessage,
		transferredCapacity?: IRpcTransferredReplayCapacity,
	): boolean {
		if (this._closed) {
			transferredCapacity?.reservation.release();
			return false;
		}
		const ordinaryFuture =
			message.kind === RpcWireRecordKindEnum.result ||
			message.kind === RpcWireRecordKindEnum.streamItem ||
			message.kind === RpcWireRecordKindEnum.streamCredit;
		if (ordinaryFuture && !this._canReserveOrdinaryFuture()) {
			transferredCapacity?.reservation.release();
			return false;
		}
		const replay = this._reserveReplayEntry(message, transferredCapacity);
		if (replay === undefined) {
			return false;
		}
		if (ordinaryFuture) {
			this._ordinaryFutureObligations += 1;
		}
		this._controlQueue.push({ message, replay, ordinaryFuture });
		this._pump();
		return true;
	}

	_canReserveOrdinaryFuture(): boolean {
		return (
			this._nextOutgoingSequence + this._ordinaryFutureObligations <=
			RPC_LAST_ORDINARY_SEQUENCE
		);
	}

	_startInvocation(entry: IRpcInvocationEntry): void {
		if (entry.started || entry.retired) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC invocation start was called more than once."),
			);
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
		const queued = this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.cancel,
				callId: entry.callId as string,
			}) as RpcSemanticMessage,
		);
		if (!queued) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error("Default RPC cancel reserve is exhausted."),
			);
		}
	}

	_startStream(entry: IRpcOutgoingStreamEntry): void {
		if (entry.started || entry.retired) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC stream start was called more than once."),
			);
			return;
		}
		entry.started = true;
		if (this._closed) {
			this._finishOutgoingStream(entry, {
				type: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			this._retireOutgoingStream(entry);
			return;
		}
		this._pendingStreams.push(entry);
		this._pump();
	}

	_cancelStream(entry: IRpcOutgoingStreamEntry): void {
		if (entry.retired || entry.publicFinished) {
			return;
		}
		this._finishOutgoingStream(entry, { type: "canceled" });
		if (!entry.admitted) {
			this._retireOutgoingStream(entry);
			return;
		}
		const queued = this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.streamCancel,
				streamId: entry.streamId as string,
			}) as RpcStreamCancelMessage,
		);
		if (!queued) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				new Error("Default RPC stream cancel reserve is exhausted."),
			);
		}
	}

	_finishOutgoingStream(
		entry: IRpcOutgoingStreamEntry,
		outcome: RpcStreamOutcome,
	): void {
		if (entry.publicFinished) {
			return;
		}
		const projection = entry.sink.reserveTerminal(outcome);
		entry.publicFinished = true;
		projection.commit();
	}

	_retireOutgoingStream(entry: IRpcOutgoingStreamEntry): void {
		if (entry.retired) {
			return;
		}
		entry.retired = true;
		const pendingIndex = this._pendingStreams.indexOf(entry);
		if (pendingIndex !== -1) {
			this._pendingStreams.splice(pendingIndex, 1);
		}
		entry.request = undefined;
		this._releasePendingStreamCharge(entry);
		entry.receiveSlotReservation?.release();
		entry.receiveSlotReservation = undefined;
		this._streams.delete(entry);
		if (entry.streamId !== undefined) {
			this._outgoingStreams.delete(entry.streamId);
		}
		this._streamCount -= 1;
		this._checkGracefulShutdown();
	}

	_releasePendingStreamCharge(entry: IRpcOutgoingStreamEntry): void {
		if (!entry.pendingCharged) {
			return;
		}
		entry.pendingCharged = false;
		this._pendingStreamBytes -= entry.pendingCharge;
		entry.retainedBytesReservation?.release();
		entry.retainedBytesReservation = undefined;
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
		while (this._pendingStreams[0]?.retired) {
			this._pendingStreams.shift();
		}
		const replaySequence = this._replayBarrier[0];
		const control = this._controlQueue[0];
		const pending = this._pendingInvocations[0];
		const pendingStream = this._pendingStreams[0];
		const probeDue = this._pongDue || this._pingDue;
		const ackDue = this._ackDue && this._ackDirty;
		const nonProbeDue =
			replaySequence !== undefined ||
			control !== undefined ||
			pending !== undefined ||
			pendingStream !== undefined ||
			ackDue;
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

		if (replaySequence !== undefined) {
			this._replayBarrier.shift();
			const replay = this._replay.get(replaySequence);
			if (replay === undefined) {
				this._fault(
					RpcCloseReasonEnum.resourceFault,
					new Error("Default RPC replay barrier lost a retained message."),
				);
				return;
			}
			this._probeSentLast = false;
			this._sendEnvelope(binding, replaySequence, replay.message);
			return;
		}

		// Control traffic wins its turn when present and selected by the lane scheduler.
		const shouldSendControl =
			control !== undefined &&
			(pending === undefined && pendingStream === undefined
				? true
				: this._nextSequencedLane === "control");
		if (shouldSendControl) {
			this._controlQueue.shift();
			if (control.ordinaryFuture) {
				this._ordinaryFutureObligations -= 1;
			}
			this._nextSequencedLane = "data";
			this._probeSentLast = false;
			this._admitSemantic(binding, control);
			return;
		}
		const shouldAdmitStream =
			pendingStream !== undefined &&
			(pending === undefined || this._nextDataKind === "stream");
		if (shouldAdmitStream) {
			this._nextSequencedLane = "control";
			this._nextDataKind = "call";
			this._probeSentLast = false;
			this._admitStream(binding, pendingStream);
			return;
		}
		if (pending !== undefined) {
			this._nextSequencedLane = "control";
			this._nextDataKind = "stream";
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

	_admitStream(
		binding: RpcBindingEpochImpl<TKey>,
		entry: IRpcOutgoingStreamEntry,
	): void {
		const counterIsExhausted =
			this._outgoingStreamOrdinalExhausted ||
			!Number.isSafeInteger(this._nextOutgoingStreamOrdinal) ||
			this._nextOutgoingSequence > RPC_LAST_ORDINARY_SEQUENCE;
		if (counterIsExhausted) {
			this._beginCounterDrain();
			return;
		}
		const request = entry.request;
		if (request === undefined) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC Pending Stream lost its request."),
			);
			return;
		}
		const streamId = String(this._nextOutgoingStreamOrdinal);
		const message: RpcStreamMethodStartMessage | RpcStreamPropertyStartMessage =
			request.kind === "stream-method"
				? Object.freeze({
						kind: RpcWireRecordKindEnum.streamMethod,
						streamId,
						service: request.service,
						member: request.member,
						args: request.args.value,
						creditThrough: 1,
					})
				: Object.freeze({
						kind: RpcWireRecordKindEnum.streamProperty,
						streamId,
						service: request.service,
						member: request.member,
						creditThrough: 1,
					});
		const replay = this._reserveReplayEntry(message);
		if (replay === undefined) {
			this._finishOutgoingStream(entry, {
				type: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			this._retireOutgoingStream(entry);
			this._pump();
			return;
		}
		try {
			this._codec.encode(
				this._createEnvelope(this._nextOutgoingSequence, message),
			);
		} catch {
			this._releaseReplayEntry(replay);
			this._finishOutgoingStream(entry, {
				type: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			this._retireOutgoingStream(entry);
			this._pump();
			return;
		}
		this._pendingStreams.shift();
		if (this._nextOutgoingStreamOrdinal === Number.MAX_SAFE_INTEGER) {
			this._outgoingStreamOrdinalExhausted = true;
		} else {
			this._nextOutgoingStreamOrdinal += 1;
		}
		entry.admitted = true;
		entry.streamId = streamId;
		entry.request = undefined;
		this._releasePendingStreamCharge(entry);
		this._outgoingStreams.set(streamId, entry);
		this._admitSemantic(binding, {
			message,
			replay,
			ordinaryFuture: false,
		});
		if (this._outgoingStreamOrdinalExhausted) {
			this._beginCounterDrain();
		}
	}

	_admitInvocation(
		binding: RpcBindingEpochImpl<TKey>,
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
			member: request.member,
			args: request.args.value,
		}) as RpcCallMessage;
		const sequence = this._nextOutgoingSequence;
		this._releasePendingRetainedBytes(entry);
		let replay = this._reserveReplayEntry(message);
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
			let guardedReplay: IRpcReplayEntry | undefined = replay;
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
					this._releaseReplayEntry(guardedReplay);
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
		this._replay.set(sequence, replay);
		entry.request = undefined;
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
		if (this._outgoingCallOrdinalExhausted) {
			this._beginCounterDrain();
		}
	}

	_admitSemantic(
		binding: RpcBindingEpochImpl<TKey>,
		queued: IRpcQueuedSemantic,
	): void {
		const { message, replay } = queued;
		// Sequenced delivery stops before the safe-integer or wire sequence limit.
		const outgoingSequenceIsExhausted =
			this._outgoingSequenceExhausted ||
			!Number.isSafeInteger(this._nextOutgoingSequence);
		if (outgoingSequenceIsExhausted) {
			this._releaseReplayEntry(replay);
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
			this._releaseReplayEntry(replay);
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
		this._replay.set(sequence, replay);
		// Result and error records both carry retained terminal payload evidence.
		const isTerminalPayload =
			message.kind === RpcWireRecordKindEnum.result ||
			message.kind === RpcWireRecordKindEnum.error;
		if (isTerminalPayload) {
			const incoming = this._incomingCalls.get(message.callId);
			if (incoming?.terminalSelected) {
				incoming.terminalSequence = sequence;
			}
		}
		if (
			message.kind === RpcWireRecordKindEnum.streamComplete ||
			message.kind === RpcWireRecordKindEnum.streamError
		) {
			const incoming = this._incomingStreams.get(message.streamId);
			if (incoming?.terminalSelected) {
				incoming.terminalSequence = sequence;
			}
		}
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_sendEnvelope(
		binding: RpcBindingEpochImpl<TKey>,
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

	_reserveReplayEntry(
		message: RpcSemanticMessage,
		transferredCapacity?: IRpcTransferredReplayCapacity,
	): IRpcReplayEntry | undefined {
		let maximumEnvelope: Uint8Array;
		try {
			maximumEnvelope = this._codec.encode({
				kind: RpcWireRecordKindEnum.message,
				seq: Number.MAX_SAFE_INTEGER,
				ackThrough: Number.MAX_SAFE_INTEGER,
				message,
			});
		} catch {
			transferredCapacity?.reservation.release();
			return undefined;
		}
		const ordinaryCharge =
			transferredCapacity?.charge ?? maximumEnvelope.byteLength + 256;
		const resourceClass =
			message.kind === RpcWireRecordKindEnum.error ||
			message.kind === RpcWireRecordKindEnum.streamComplete ||
			message.kind === RpcWireRecordKindEnum.streamError
				? "terminal"
				: message.kind === RpcWireRecordKindEnum.cancel ||
						message.kind === RpcWireRecordKindEnum.streamCancel
					? "cancel"
					: "ordinary";
		const charge =
			resourceClass === "terminal"
				? 768
				: resourceClass === "cancel"
					? 384
					: ordinaryCharge;
		const maximumEntries = this._host.policy.maxApplicationWorkPerSession * 4;
		const maximumBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 2,
		);
		const maximumTerminalBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		const isTerminalPayload = message.kind === RpcWireRecordKindEnum.result;
		let retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
		// Ordinary replay must fit aggregate entry, byte, and terminal-payload budgets.
		const ordinaryReplayCapacityExceeded =
			this._ordinaryReplayCount >= maximumEntries ||
			charge > maximumBytes - this._replayBytes ||
			(isTerminalPayload &&
				(this._terminalPayloadCount >= 256 ||
					charge > maximumTerminalBytes - this._terminalReplayBytes));
		if (resourceClass === "terminal") {
			if (ordinaryCharge > charge || this._terminalReplayCount >= 256) {
				return undefined;
			}
			this._terminalReplayCount += 1;
		} else if (resourceClass === "cancel") {
			if (ordinaryCharge > charge || this._cancelReplayCount >= 256) {
				return undefined;
			}
			this._cancelReplayCount += 1;
		} else if (ordinaryReplayCapacityExceeded) {
			transferredCapacity?.reservation.release();
			return undefined;
		} else {
			retainedBytesReservation =
				transferredCapacity?.reservation ?? this.reserveRetainedBytes(charge);
			if (retainedBytesReservation === undefined) {
				return undefined;
			}
			this._ordinaryReplayCount += 1;
			this._replayBytes += charge;
			if (isTerminalPayload) {
				this._terminalPayloadCount += 1;
				this._terminalReplayBytes += charge;
			}
		}
		return {
			message,
			charge,
			retainedBytesReservation,
			resourceClass,
			released: false,
		};
	}

	_releaseReplayEntry(replay: IRpcReplayEntry): void {
		if (replay.released) {
			return;
		}
		replay.released = true;
		replay.retainedBytesReservation?.release();
		if (replay.resourceClass === "terminal") {
			this._terminalReplayCount -= 1;
			return;
		}
		if (replay.resourceClass === "cancel") {
			this._cancelReplayCount -= 1;
			return;
		}
		this._ordinaryReplayCount -= 1;
		this._replayBytes -= replay.charge;
		if (replay.message.kind === RpcWireRecordKindEnum.result) {
			this._terminalPayloadCount -= 1;
			this._terminalReplayBytes -= replay.charge;
		}
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
		this._releaseReceivedComparisonEvidence(this._receivedThrough);
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
	}

	_releaseReceivedComparisonEvidence(ackThrough: number): void {
		for (const sequence of this._receivedFingerprints.keys()) {
			if (sequence <= ackThrough) {
				this._receivedFingerprints.delete(sequence);
			}
		}
	}

	_sendUnsequenced(
		binding: RpcBindingEpochImpl<TKey>,
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
		if (record.kind === RpcWireRecordKindEnum.ack) {
			this._releaseReceivedComparisonEvidence(this._receivedThrough);
		}
		this._sendEncoded(binding, encoded);
	}

	_sendEncoded(binding: RpcBindingEpochImpl<TKey>, encoded: Uint8Array): void {
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
		for (const sequence of this._replay.keys()) {
			if (sequence <= ackThrough) {
				const replay = this._replay.get(sequence);
				if (replay !== undefined) {
					this._releaseReplayEntry(replay);
				}
				this._replay.delete(sequence);
			}
		}
		this._replayBarrier = this._replayBarrier.filter(
			(sequence) => sequence > ackThrough,
		);
		for (const [callId, incoming] of this._incomingCalls) {
			// ACK retirement applies only after the incoming terminal was sequenced and acknowledged.
			const terminalIsAcknowledged =
				incoming.terminalSequence !== undefined &&
				incoming.terminalSequence <= ackThrough;
			if (terminalIsAcknowledged) {
				this._incomingCalls.delete(callId);
			}
		}
		for (const [streamId, incoming] of this._incomingStreams) {
			const terminalIsAcknowledged =
				incoming.terminalSequence !== undefined &&
				incoming.terminalSequence <= ackThrough &&
				incoming.released;
			if (terminalIsAcknowledged) {
				this._incomingStreams.delete(streamId);
			}
		}
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
		entry.sink.finish(outcome);
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
		for (const incoming of this._incomingCalls.values()) {
			if (!incoming.terminalSelected && incoming.call !== undefined) {
				incoming.terminalSelected = true;
				this._finishIncomingCall(incoming, {
					type: RpcCallTerminalTypeEnum.sessionTerminated,
				});
			}
		}
		for (const entry of [...this._streams]) {
			this._finishOutgoingStream(
				entry,
				entry.admitted
					? {
							type: "failed",
							code: RpcExceptionCodeEnum.outcomeUnknown,
						}
					: {
							type: "failed",
							code: RpcExceptionCodeEnum.unavailable,
						},
			);
			this._retireOutgoingStream(entry);
		}
		for (const incoming of this._incomingStreams.values()) {
			if (!incoming.released) {
				incoming.terminalSelected = true;
				incoming.stream?.finish({ type: "session-terminated" }, () =>
					this._releaseIncomingStream(incoming),
				);
			}
		}
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
		for (const replay of this._replay.values()) {
			this._releaseReplayEntry(replay);
		}
		for (const queued of this._controlQueue) {
			if (queued.ordinaryFuture) {
				this._ordinaryFutureObligations -= 1;
			}
			this._releaseReplayEntry(queued.replay);
		}
		this._replay.clear();
		this._replayBarrier.length = 0;
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
		for (const entry of [...this._streams]) {
			if (!entry.admitted) {
				this._finishOutgoingStream(entry, {
					type: "failed",
					code: RpcExceptionCodeEnum.unavailable,
				});
				this._retireOutgoingStream(entry);
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
		this._receivedFingerprints.clear();
		this._protectedRetainedBytesReservation.release();
		unregisterRpcSessionRetainedBytes(this);
		this._proofKey = undefined;
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

	_startHealthTimer(binding: RpcBindingEpochImpl<TKey>): void {
		this._stopHealthTimer();
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._scheduleHealthTimer(binding);
	}

	_recordInboundActivity(binding: RpcBindingEpochImpl<TKey>): void {
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

	_scheduleHealthTimer(binding: RpcBindingEpochImpl<TKey>): void {
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

	_healthTimerFired(binding: RpcBindingEpochImpl<TKey>): void {
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
		const incomingActive = [...this._incomingCalls.values()].some(
			(entry) => !entry.terminalSelected,
		);
		const incomingStreamActive = [...this._incomingStreams.values()].some(
			(entry) => !entry.released,
		);
		// Graceful close waits for all retained work and binding I/O to drain.
		const drainIsIncomplete =
			this._invocations.size !== 0 ||
			this._streams.size !== 0 ||
			incomingActive ||
			incomingStreamActive ||
			this._pendingInvocations.some((entry) => !entry.retired) ||
			this._pendingStreams.some((entry) => !entry.retired) ||
			this._controlQueue.length !== 0 ||
			this._replayBarrier.length !== 0 ||
			this._replay.size !== 0 ||
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

function rpcJsonValuesEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) {
		return true;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		return (
			Array.isArray(left) &&
			Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => rpcJsonValuesEqual(value, right[index]))
		);
	}
	if (
		typeof left !== "object" ||
		left === null ||
		typeof right !== "object" ||
		right === null
	) {
		return false;
	}
	const leftRecord = left as Readonly<Record<string, unknown>>;
	const rightRecord = right as Readonly<Record<string, unknown>>;
	const leftKeys = Object.keys(leftRecord).sort();
	const rightKeys = Object.keys(rightRecord).sort();
	return (
		leftKeys.length === rightKeys.length &&
		leftKeys.every(
			(key, index) =>
				key === rightKeys[index] &&
				rpcJsonValuesEqual(leftRecord[key], rightRecord[key]),
		)
	);
}
