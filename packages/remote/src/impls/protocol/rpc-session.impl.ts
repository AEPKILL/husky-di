/**
 * @overview Retained husky-di-rpc/1 Logical Session, call, sequence, ACK, and replay state.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROTECTED_SESSION_BYTES } from "@/constants/protocol/rpc-profile.const";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcDecodePhaseEnum } from "@/enums/protocol/rpc-decode-phase.enum";
import { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcPeerCursorClassificationEnum } from "@/enums/protocol/rpc-peer-cursor-classification.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import {
	RpcRetainedBytesLedgerImpl,
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "@/impls/protocol/rpc-retained-bytes-ledger.impl";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type {
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolInvocation,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";
import type { CreateRpcSessionOptions } from "@/types/protocol/rpc-session.type";
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

const RPC_SEQUENCE_RESERVE = 512;
const RPC_LAST_ORDINARY_SEQUENCE =
	Number.MAX_SAFE_INTEGER - RPC_SEQUENCE_RESERVE;

interface IRpcBinding {
	readonly endpoint: IRpcEndpoint;
	active: boolean;
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
}

/** Retains one Session Incarnation independently from its current Connection. */
export class RpcSessionImpl<TKey = CryptoKey> implements IRpcSession<TKey> {
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _codec: IRpcCodec;
	readonly _onTerminal: (session: IRpcSession<TKey>) => void;
	readonly _retainedBytesLedger: RpcRetainedBytesLedgerImpl;
	readonly _protectedRetainedBytesReservation: IRpcRetainedBytesReservation;
	_proofKey: TKey | undefined;
	_sessionHost: IRpcProtocolSessionHost | undefined;
	_binding: IRpcBinding | undefined;
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
	readonly _incomingCalls = new Map<string, IRpcIncomingEntry>();
	readonly _replay = new Map<number, IRpcReplayEntry>();
	_replayBytes = 0;
	_ordinaryReplayCount = 0;
	_terminalReplayCount = 0;
	_terminalPayloadCount = 0;
	_terminalReplayBytes = 0;
	_cancelReplayCount = 0;
	_replayBarrier: number[] = [];
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

	public constructor(options: CreateRpcSessionOptions<TKey>) {
		const {
			codec,
			counterExhausted = false,
			host,
			onTerminal,
			proofKey,
			sessionId,
		} = options;
		this._host = host;
		this._retainedBytesLedger = new RpcRetainedBytesLedgerImpl(
			host.policy.maxRetainedBytesPerSession,
		);
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

	get receivedThrough(): number {
		return this._receivedThrough;
	}

	get bindingEpoch(): number {
		return this._bindingEpoch;
	}

	get proofKey(): TKey | undefined {
		return this._proofKey;
	}

	get isRecovering(): boolean {
		return this._recovering && !this._closed;
	}

	get recoveryReclaimDeadline(): number | undefined {
		return this.isRecovering && this._binding === undefined
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

	ownsEndpoint(endpoint: IRpcEndpoint): boolean {
		return this._binding?.endpoint === endpoint;
	}

	consumeResumeAttempt(): number {
		if (this._closed || !this._recovering || this._proofKey === undefined) {
			throw new Error("Default RPC Session is not recoverable.");
		}
		if (this._resumeAttempt >= Number.MAX_SAFE_INTEGER) {
			throw new Error("Default RPC resumeAttempt counter is exhausted.");
		}
		this._resumeAttempt += 1;
		return this._resumeAttempt;
	}

	classifyPeerCursor(cursor: number): RpcPeerCursorClassificationEnum {
		if (cursor < this._peerReceivedThrough) {
			return RpcPeerCursorClassificationEnum.lower;
		}
		if (cursor > this._highestSentSequence) {
			return RpcPeerCursorClassificationEnum.upper;
		}
		return RpcPeerCursorClassificationEnum.valid;
	}

	canAcceptResumeAttempt(resumeAttempt: number): boolean {
		return (
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

	terminateForced(): void {
		this._terminateRetainedSession(RpcCloseReasonEnum.forcedClose);
	}

	acceptResumeBinding(
		endpoint: IRpcEndpoint,
		resumeAttempt: number,
		peerReceivedThrough: number,
	): number {
		if (
			!this.canAcceptResumeAttempt(resumeAttempt) ||
			this.classifyPeerCursor(peerReceivedThrough) !==
				RpcPeerCursorClassificationEnum.valid
		) {
			throw new Error("Default RPC resume candidate is no longer current.");
		}
		const epoch = this._bindingEpoch + 1;
		this._highestAcceptedResumeAttempt = resumeAttempt;
		this.installBinding(endpoint, epoch, peerReceivedThrough);
		this._cancelRecoveryDeadline();
		return epoch;
	}

	terminateContinuityFailure(cause?: Error): void {
		this._terminateRetainedSession(RpcCloseReasonEnum.continuityFailure, cause);
	}

	terminateAuthenticatedRemote(cause?: Error): void {
		this._terminateRetainedSession(RpcCloseReasonEnum.remoteTerminated, cause);
	}

	installHost(host: IRpcProtocolSessionHost): void {
		if (this._sessionHost !== undefined || this._closed) {
			throw new Error("Default RPC Session host was installed more than once.");
		}
		this._sessionHost = host;
	}

	installBinding(
		endpoint: IRpcEndpoint,
		epoch: number,
		peerReceivedThrough: number,
	): void {
		if (
			this._closed ||
			!Number.isSafeInteger(epoch) ||
			epoch <= this._bindingEpoch ||
			peerReceivedThrough < this._peerReceivedThrough ||
			peerReceivedThrough > this._highestSentSequence
		) {
			throw new Error("Default RPC Session binding continuity is invalid.");
		}
		this._stopHealthTimer();
		this._healthStallGraceUntil = 0;
		this._pingDue = false;
		this._pongDue = false;
		endpoint.configureSendProgressTimeout(
			this._host.policy.sendProgressTimeoutMs,
		);
		endpoint.observeIngressIdle(() => {
			this._pump();
			this._checkGracefulShutdown();
		});
		this._binding?.endpoint.fenceAndClose();
		this._bindingEpoch = epoch;
		this._applyAck(peerReceivedThrough);
		this._replayBarrier = [...this._replay.keys()].filter(
			(sequence) => sequence > peerReceivedThrough,
		);
		this._binding = { endpoint, active: false };
	}

	activateBinding(): void {
		const binding = this._binding;
		if (binding === undefined || binding.active || this._closed) {
			throw new Error("Default RPC binding cannot enter active phase.");
		}
		binding.active = true;
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
		this._startHealthTimer(binding);
		this._pump();
	}

	receive(endpoint: IRpcEndpoint, bytes: Uint8Array): void {
		const binding = this._binding;
		if (
			this._closed ||
			binding === undefined ||
			binding.endpoint !== endpoint ||
			!binding.active
		) {
			endpoint.fenceAndClose();
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

	endpointFailed(
		endpoint: IRpcEndpoint,
		reason: RpcEndpointFailureEnum,
		error?: Error,
	): void {
		if (this._binding?.endpoint !== endpoint || this._closed) {
			return;
		}
		if (
			reason === RpcEndpointFailureEnum.protocol ||
			reason === RpcEndpointFailureEnum.resource
		) {
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

	reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		const pendingCharge = request.args.weight + 256;
		const maximumPendingBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		if (
			this._closed ||
			this._draining ||
			this._invocationCount >=
				this._host.policy.maxPendingInvocationsPerSession ||
			!Number.isSafeInteger(pendingCharge) ||
			pendingCharge > maximumPendingBytes - this._pendingInvocationBytes
		) {
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
		this._onTerminal(this);
		this._resolveShutdown?.();
		this._resolveShutdown = undefined;
	}

	_receiveEnvelope(envelope: RpcMessageEnvelope): boolean {
		if (
			envelope.ackThrough !== undefined &&
			!this._applyAck(envelope.ackThrough)
		) {
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
		if (this._draining || this._incomingCalls.size >= 256) {
			this._highestIncomingCallOrdinal = ordinal;
			this._queueError(message.callId, RpcExceptionCodeEnum.unavailable);
			return;
		}
		const reservation = sessionHost.reserveIncomingCall({
			service: message.service,
			method: message.method,
			args,
		});
		this._highestIncomingCallOrdinal = ordinal;
		if (reservation === undefined) {
			this._incomingCalls.set(message.callId, {
				callId: message.callId,
				terminalSelected: true,
			});
			this._queueError(message.callId, RpcExceptionCodeEnum.unavailable);
			return;
		}

		if (reservation.kind === RpcIncomingCallKindEnum.unknown) {
			const incoming = reservation.reservation.commit();
			if (this._closed) {
				incoming.finish({
					type: RpcCallTerminalTypeEnum.failed,
					code: reservation.code,
				});
				return;
			}
			const entry: IRpcIncomingEntry = {
				callId: message.callId,
				call: incoming,
				terminalSelected: true,
			};
			this._incomingCalls.set(message.callId, entry);
			this._finishIncomingCall(entry, {
				type: RpcCallTerminalTypeEnum.failed,
				code: reservation.code,
			});
			this._queueError(message.callId, reservation.code);
			return;
		}

		const incoming = reservation.reservation.commit();
		if (this._closed) {
			incoming.finish({
				type: RpcCallTerminalTypeEnum.sessionTerminated,
			});
			return;
		}
		const entry: IRpcIncomingEntry = {
			callId: message.callId,
			call: incoming,
			terminalSelected: false,
		};
		this._incomingCalls.set(message.callId, entry);
		void incoming.handlerOutcome.then(
			(outcome) => this._finishIncomingHandler(entry, outcome),
			() =>
				this._finishIncomingHandler(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.handlerFailed,
				}),
		);
	}

	_receiveCancel(callId: string): void {
		const incoming = this._incomingCalls.get(callId);
		if (incoming === undefined) {
			if (Number(callId) > this._highestIncomingCallOrdinal) {
				throw new Error("Default RPC cancel refers to a future Call Ordinal.");
			}
			return;
		}
		if (incoming.terminalSelected || incoming.call === undefined) {
			return;
		}
		incoming.terminalSelected = true;
		this._finishIncomingCall(incoming, {
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.canceled,
		});
		this._queueError(callId, RpcExceptionCodeEnum.canceled);
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
		entry: IRpcIncomingEntry,
		outcome: RpcHandlerOutcome,
	): void {
		if (this._closed || entry.terminalSelected || entry.call === undefined) {
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
		const replay = this._reserveReplayEntry(message);
		if (replay === undefined) {
			return false;
		}
		this._controlQueue.push({ message, replay });
		this._pump();
		return true;
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
		this._queueSemantic(
			Object.freeze({
				kind: RpcWireRecordKindEnum.cancel,
				callId: entry.callId as string,
			}) as RpcSemanticMessage,
		);
	}

	_pump(): void {
		const binding = this._binding;
		if (
			this._closed ||
			binding === undefined ||
			!binding.active ||
			!binding.endpoint.isSendIdle
		) {
			return;
		}

		while (this._pendingInvocations[0]?.retired) {
			this._pendingInvocations.shift();
		}
		const replaySequence = this._replayBarrier[0];
		const control = this._controlQueue[0];
		const pending = this._pendingInvocations[0];
		const probeDue = this._pongDue || this._pingDue;
		const ackDue = this._ackDue && this._ackDirty;
		const nonProbeDue =
			replaySequence !== undefined ||
			control !== undefined ||
			pending !== undefined ||
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

		if (
			control !== undefined &&
			(pending === undefined || this._nextSequencedLane === "control")
		) {
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

	_admitInvocation(binding: IRpcBinding, entry: IRpcInvocationEntry): void {
		if (
			this._outgoingCallOrdinalExhausted ||
			!Number.isSafeInteger(this._nextOutgoingCallOrdinal) ||
			this._nextOutgoingSequence > RPC_LAST_ORDINARY_SEQUENCE
		) {
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

	_admitSemantic(binding: IRpcBinding, queued: IRpcQueuedSemantic): void {
		const { message, replay } = queued;
		if (
			this._outgoingSequenceExhausted ||
			!Number.isSafeInteger(this._nextOutgoingSequence)
		) {
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
		if (
			message.kind === RpcWireRecordKindEnum.result ||
			message.kind === RpcWireRecordKindEnum.error
		) {
			const incoming = this._incomingCalls.get(message.callId);
			if (incoming?.terminalSelected) {
				incoming.terminalSequence = sequence;
			}
		}
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_sendEnvelope(
		binding: IRpcBinding,
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
			return undefined;
		}
		const ordinaryCharge = maximumEnvelope.byteLength + 256;
		const resourceClass =
			message.kind === RpcWireRecordKindEnum.error
				? "terminal"
				: message.kind === RpcWireRecordKindEnum.cancel
					? "cancel"
					: "ordinary";
		const charge =
			resourceClass === "terminal"
				? 768
				: resourceClass === "cancel"
					? 384
					: ordinaryCharge;
		const maximumEntries =
			this._host.policy.maxPendingInvocationsPerSession * 4;
		const maximumBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 2,
		);
		const maximumTerminalBytes = Math.floor(
			this._host.policy.maxRetainedBytesPerSession / 4,
		);
		const isTerminalPayload = message.kind === RpcWireRecordKindEnum.result;
		let retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
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
		} else if (
			this._ordinaryReplayCount >= maximumEntries ||
			charge > maximumBytes - this._replayBytes ||
			(isTerminalPayload &&
				(this._terminalPayloadCount >= 256 ||
					charge > maximumTerminalBytes - this._terminalReplayBytes))
		) {
			return undefined;
		} else {
			retainedBytesReservation = this.reserveRetainedBytes(charge);
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
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
	}

	_sendUnsequenced(binding: IRpcBinding, record: RpcJsonRecord): void {
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

	_sendEncoded(binding: IRpcBinding, encoded: Uint8Array): void {
		void binding.endpoint.sendNow(encoded).then(
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

	_applyAck(ackThrough: number): boolean {
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
			if (
				incoming.terminalSequence !== undefined &&
				incoming.terminalSequence <= ackThrough
			) {
				this._incomingCalls.delete(callId);
			}
		}
		this._checkGracefulShutdown();
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
		binding?.endpoint.fenceAndClose();
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
		this._onTerminal(this);
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
		this._onTerminal(this);
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
		this._onTerminal(this);
	}

	_teardownTerminalState(): void {
		this._closed = true;
		this._clearTimers();
		this._terminateOpenCalls();
		this._releaseReplayState();
		this._binding?.endpoint.fenceAndClose();
		this._protectedRetainedBytesReservation.release();
		unregisterRpcSessionRetainedBytes(this);
		this._binding = undefined;
		this._proofKey = undefined;
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

	_startHealthTimer(binding: IRpcBinding): void {
		this._stopHealthTimer();
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._scheduleHealthTimer(binding);
	}

	_recordInboundActivity(binding: IRpcBinding): void {
		if (this._binding !== binding || !binding.active || this._closed) {
			return;
		}
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._pingDue = false;
		this._scheduleHealthTimer(binding);
	}

	_scheduleHealthTimer(binding: IRpcBinding): void {
		this._stopHealthTimer();
		if (this._binding !== binding || !binding.active || this._closed) {
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

	_healthTimerFired(binding: IRpcBinding): void {
		this._healthTimer = undefined;
		if (this._binding !== binding || !binding.active || this._closed) {
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
		if (
			now - this._lastInboundActivityAt >= this._host.policy.silenceTimeoutMs &&
			now >= this._healthStallGraceUntil
		) {
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
		if (
			(this._shutdownTask === undefined && !this._counterDraining) ||
			this._closed ||
			this._gracefulCloseStarted
		) {
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
		if (
			this._invocations.size !== 0 ||
			incomingActive ||
			this._pendingInvocations.some((entry) => !entry.retired) ||
			this._controlQueue.length !== 0 ||
			this._replayBarrier.length !== 0 ||
			this._replay.size !== 0 ||
			this._ackDirty ||
			this._ackDue ||
			!binding.active ||
			!binding.endpoint.isIngressIdle ||
			!binding.endpoint.isSendIdle
		) {
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
		void binding.endpoint.sendNow(encoded).then(
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
