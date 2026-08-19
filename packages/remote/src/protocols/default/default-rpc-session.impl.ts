/**
 * @overview Retained husky-di-rpc/1 Logical Session, call, sequence, ACK, and replay state.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolInvocation,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
} from "@/interfaces/rpc-protocol.interface";
import {
	decodeDefaultRpcRecord,
	encodeDefaultRpcRecord,
	hasDefaultRpcRecordMember,
	validateDefaultRpcActiveRecord,
} from "@/protocols/default/default-rpc-codec.util";
import type {
	DefaultRpcEndpoint,
	DefaultRpcEndpointFailure,
} from "@/protocols/default/default-rpc-endpoint.impl";
import type {
	DefaultRpcCallMessage,
	DefaultRpcErrorMessage,
	DefaultRpcJsonRecord,
	DefaultRpcMessageEnvelope,
	DefaultRpcResultMessage,
	DefaultRpcSemanticMessage,
	DefaultRpcWireErrorCode,
} from "@/protocols/default/default-rpc-record.type";

const DEFAULT_RPC_SEQUENCE_RESERVE = 512;
const DEFAULT_RPC_LAST_ORDINARY_SEQUENCE =
	Number.MAX_SAFE_INTEGER - DEFAULT_RPC_SEQUENCE_RESERVE;

interface IDefaultRpcBinding {
	readonly endpoint: DefaultRpcEndpoint;
	readonly epoch: number;
	active: boolean;
}

interface IDefaultRpcInvocationEntry {
	readonly request: IRpcProtocolInvocationRequest;
	readonly sink: IRpcProtocolInvocationSink;
	readonly pendingCharge: number;
	pendingCharged: boolean;
	started: boolean;
	admitted: boolean;
	publicFinished: boolean;
	retired: boolean;
	callId?: string;
	seq?: number;
}

interface IDefaultRpcIncomingEntry {
	readonly callId: string;
	call?: IRpcProtocolIncomingCall;
	handlerCall?: IRpcProtocolIncomingHandlerCall;
	terminalSequence?: number;
	terminalSelected: boolean;
}

interface IDefaultRpcReplayEntry {
	readonly message: DefaultRpcSemanticMessage;
	readonly charge: number;
	readonly resourceClass: "ordinary" | "terminal" | "cancel";
	released: boolean;
}

interface IDefaultRpcQueuedSemantic {
	readonly message: DefaultRpcSemanticMessage;
	readonly replay: IDefaultRpcReplayEntry;
}

/** Retains one Session Incarnation independently from its current Connection. */
export class DefaultRpcSession implements IRpcProtocolSession {
	readonly _role: "connector" | "acceptor";
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _onTerminal: (session: DefaultRpcSession) => void;
	_proofKey: CryptoKey | undefined;
	_sessionHost: IRpcProtocolSessionHost | undefined;
	_binding: IDefaultRpcBinding | undefined;
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
	readonly _invocations = new Set<IDefaultRpcInvocationEntry>();
	readonly _pendingInvocations: IDefaultRpcInvocationEntry[] = [];
	readonly _outgoingCalls = new Map<string, IDefaultRpcInvocationEntry>();
	readonly _incomingCalls = new Map<string, IDefaultRpcIncomingEntry>();
	readonly _replay = new Map<number, IDefaultRpcReplayEntry>();
	_replayBytes = 0;
	_ordinaryReplayCount = 0;
	_terminalReplayCount = 0;
	_terminalPayloadCount = 0;
	_terminalReplayBytes = 0;
	_cancelReplayCount = 0;
	_replayBarrier: number[] = [];
	readonly _controlQueue: IDefaultRpcQueuedSemantic[] = [];
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

	constructor(
		role: "connector" | "acceptor",
		host: IRpcProtocolHost,
		sessionId: string,
		proofKey: CryptoKey,
		onTerminal: (session: DefaultRpcSession) => void,
		counterExhausted = false,
	) {
		this._role = role;
		this._host = host;
		this._sessionId = sessionId;
		this._proofKey = proofKey;
		this._onTerminal = onTerminal;
		if (counterExhausted) {
			this._nextOutgoingSequence = DEFAULT_RPC_LAST_ORDINARY_SEQUENCE + 1;
		}
	}

	get sessionId(): string {
		return this._sessionId;
	}

	get receivedThrough(): number {
		return this._receivedThrough;
	}

	get peerReceivedThrough(): number {
		return this._peerReceivedThrough;
	}

	get highestSentSequence(): number {
		return this._highestSentSequence;
	}

	get bindingEpoch(): number {
		return this._bindingEpoch;
	}

	get proofKey(): CryptoKey | undefined {
		return this._proofKey;
	}

	get isRecovering(): boolean {
		return this._recovering && !this._closed;
	}

	get isClosed(): boolean {
		return this._closed;
	}

	get highestAcceptedResumeAttempt(): number {
		return this._highestAcceptedResumeAttempt;
	}

	ownsEndpoint(endpoint: DefaultRpcEndpoint): boolean {
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

	classifyPeerCursor(cursor: number): "valid" | "lower" | "upper" {
		if (cursor < this._peerReceivedThrough) {
			return "lower";
		}
		if (cursor > this._highestSentSequence) {
			return "upper";
		}
		return "valid";
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

	acceptResumeBinding(
		endpoint: DefaultRpcEndpoint,
		resumeAttempt: number,
		peerReceivedThrough: number,
	): number {
		if (
			!this.canAcceptResumeAttempt(resumeAttempt) ||
			this.classifyPeerCursor(peerReceivedThrough) !== "valid"
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
		this._terminateRetainedSession("continuity-failure", cause);
	}

	terminateAuthenticatedRemote(cause?: Error): void {
		this._terminateRetainedSession("remote-terminated", cause);
	}

	installHost(host: IRpcProtocolSessionHost): void {
		if (this._sessionHost !== undefined || this._closed) {
			throw new Error("Default RPC Session host was installed more than once.");
		}
		this._sessionHost = host;
	}

	installBinding(
		endpoint: DefaultRpcEndpoint,
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
		this._binding = { endpoint, epoch, active: false };
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
			this._sessionHost?.transition({ type: "recovered" });
		}
		this._startHealthTimer(binding);
		this._pump();
	}

	receive(endpoint: DefaultRpcEndpoint, bytes: Uint8Array): void {
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

		let record: ReturnType<typeof validateDefaultRpcActiveRecord>;
		try {
			record = validateDefaultRpcActiveRecord(decodeDefaultRpcRecord(bytes));
		} catch (error) {
			this._fault(
				"protocol-fault",
				error instanceof Error
					? error
					: new Error("Default RPC active record is invalid."),
			);
			return;
		}

		if (record.kind === "ack") {
			if (this._applyAck(record.ackThrough)) {
				this._recordInboundActivity(binding);
			}
			return;
		}
		if (record.kind === "ping") {
			this._recordInboundActivity(binding);
			this._pongDue = true;
			this._pump();
			return;
		}
		if (record.kind === "pong") {
			this._recordInboundActivity(binding);
			return;
		}
		if (record.kind === "close") {
			this._terminalFromPeer();
			return;
		}
		if (record.kind !== "message") {
			this._fault(
				"protocol-fault",
				new Error("Default RPC active phase produced an invalid record kind."),
			);
			return;
		}
		if (this._receiveEnvelope(record)) {
			this._recordInboundActivity(binding);
		}
	}

	endpointFailed(
		endpoint: DefaultRpcEndpoint,
		reason: DefaultRpcEndpointFailure,
		error?: Error,
	): void {
		if (this._binding?.endpoint !== endpoint || this._closed) {
			return;
		}
		if (reason === "protocol" || reason === "resource") {
			this._fault(
				reason === "protocol" ? "protocol-fault" : "resource-fault",
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
		this._invocationCount += 1;
		this._pendingInvocationBytes += pendingCharge;
		let reservationState: "reserved" | "committed" | "released" = "reserved";
		let entry: IDefaultRpcInvocationEntry | undefined;
		return Object.freeze({
			commit: (sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation => {
				if (reservationState !== "reserved") {
					this._fault(
						"protocol-fault",
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
					pendingCharged: true,
					started: false,
					admitted: false,
					publicFinished: false,
					retired: false,
				};
				this._invocations.add(entry);
				return Object.freeze({
					start: () =>
						this._startInvocation(entry as IDefaultRpcInvocationEntry),
					cancel: () =>
						this._cancelInvocation(entry as IDefaultRpcInvocationEntry),
				});
			},
			release: (): void => {
				if (reservationState !== "reserved") {
					this._fault(
						"protocol-fault",
						new Error(
							"Default RPC invocation reservation had multiple winners.",
						),
					);
					return;
				}
				reservationState = "released";
				this._invocationCount -= 1;
				this._pendingInvocationBytes -= pendingCharge;
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
		this._shutdownTask = new Promise<void>((resolve) => {
			this._resolveShutdown = resolve;
		});
		this._draining = true;
		this._checkGracefulShutdown();
		return this._shutdownTask;
	}

	forceClose(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._clearTimers();
		for (const entry of [...this._invocations]) {
			this._finishInvocation(
				entry,
				entry.admitted
					? { type: "failed", code: "outcome-unknown" }
					: { type: "failed", code: "unavailable" },
			);
			this._retireInvocation(entry);
		}
		for (const incoming of this._incomingCalls.values()) {
			if (!incoming.terminalSelected && incoming.call !== undefined) {
				incoming.terminalSelected = true;
				incoming.call.finish({ type: "session-terminated" });
			}
		}
		this._binding?.endpoint.fenceAndClose();
		this._binding = undefined;
		this._proofKey = undefined;
		this._onTerminal(this);
		this._resolveShutdown?.();
		this._resolveShutdown = undefined;
	}

	_receiveEnvelope(envelope: DefaultRpcMessageEnvelope): boolean {
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
				"protocol-fault",
				new Error("Default RPC message sequence contains a gap."),
			);
			return false;
		}

		try {
			this._dispatchSemantic(envelope.message);
		} catch (error) {
			this._fault(
				"protocol-fault",
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

	_dispatchSemantic(message: DefaultRpcSemanticMessage): void {
		if (message.kind === "call") {
			this._receiveCall(message);
			return;
		}
		if (message.kind === "cancel") {
			this._receiveCancel(message.callId);
			return;
		}
		if (message.kind === "result") {
			this._receiveResult(message);
			return;
		}
		this._receiveError(message);
	}

	_receiveCall(message: DefaultRpcCallMessage): void {
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
			this._queueError(message.callId, "unavailable");
			return;
		}
		const args = this._host.normalizeApplicationArguments(message.args);
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
			this._queueError(message.callId, "unavailable");
			return;
		}

		if (reservation.kind === "unknown") {
			const incoming = reservation.reservation.commit();
			const entry: IDefaultRpcIncomingEntry = {
				callId: message.callId,
				call: incoming,
				terminalSelected: true,
			};
			this._incomingCalls.set(message.callId, entry);
			incoming.finish({ type: "failed", code: reservation.code });
			this._queueError(message.callId, reservation.code);
			return;
		}

		const incoming = reservation.reservation.commit();
		const entry: IDefaultRpcIncomingEntry = {
			callId: message.callId,
			call: incoming,
			handlerCall: incoming,
			terminalSelected: false,
		};
		this._incomingCalls.set(message.callId, entry);
		void incoming.handlerOutcome.then(
			(outcome) => this._finishIncomingHandler(entry, outcome),
			() =>
				this._finishIncomingHandler(entry, {
					type: "failed",
					code: "handler-failed",
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
		incoming.call.finish({ type: "failed", code: "canceled" });
		this._queueError(callId, "canceled");
	}

	_receiveResult(message: DefaultRpcResultMessage): void {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error("Default RPC result has no matching Logical Call.");
		}
		let outcome: RpcCallOutcome;
		if (hasDefaultRpcRecordMember(message, "value")) {
			outcome = {
				type: "returned",
				value: this._host.normalizeApplicationValue(message.value),
			};
		} else {
			outcome = { type: "returned-void" };
		}
		this._finishInvocation(invocation, outcome);
		this._retireInvocation(invocation);
	}

	_receiveError(message: DefaultRpcErrorMessage): void {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error("Default RPC error has no matching Logical Call.");
		}
		if (
			hasDefaultRpcRecordMember(
				message.error as DefaultRpcJsonRecord,
				"details",
			)
		) {
			this._host.normalizeApplicationValue(message.error.details);
		}
		this._finishInvocation(invocation, {
			type: "failed",
			code: message.error.code,
		});
		this._retireInvocation(invocation);
	}

	_finishIncomingHandler(
		entry: IDefaultRpcIncomingEntry,
		outcome: RpcHandlerOutcome,
	): void {
		if (this._closed || entry.terminalSelected || entry.call === undefined) {
			return;
		}
		entry.terminalSelected = true;
		let terminal: RpcIncomingTerminal;
		if (outcome.type === "returned") {
			const queued = this._queueSemantic(
				Object.freeze({
					kind: "result",
					callId: entry.callId,
					value: outcome.value.value,
				}) as DefaultRpcResultMessage,
			);
			terminal = queued
				? { type: "returned", value: outcome.value }
				: { type: "failed", code: "handler-failed" };
			if (!queued) {
				this._queueError(entry.callId, "handler-failed");
			}
		} else if (outcome.type === "returned-void") {
			const queued = this._queueSemantic(
				Object.freeze({
					kind: "result",
					callId: entry.callId,
				}) as DefaultRpcResultMessage,
			);
			terminal = queued
				? { type: "returned-void" }
				: { type: "failed", code: "handler-failed" };
			if (!queued) {
				this._queueError(entry.callId, "handler-failed");
			}
		} else {
			terminal = { type: "failed", code: "handler-failed" };
			this._queueError(entry.callId, "handler-failed");
		}
		entry.call.finish(terminal);
	}

	_queueError(callId: string, code: DefaultRpcWireErrorCode): boolean {
		const queued = this._queueSemantic(
			Object.freeze({
				kind: "error",
				callId,
				error: Object.freeze({
					code,
					message: `Remote call failed with code ${code}.`,
				}),
			}) as DefaultRpcErrorMessage,
		);
		if (!queued) {
			this._fault(
				"resource-fault",
				new Error("Default RPC protected terminal reserve is exhausted."),
			);
		}
		return queued;
	}

	_queueSemantic(message: DefaultRpcSemanticMessage): boolean {
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

	_startInvocation(entry: IDefaultRpcInvocationEntry): void {
		if (entry.started || entry.retired) {
			this._fault(
				"protocol-fault",
				new Error("Default RPC invocation start was called more than once."),
			);
			return;
		}
		entry.started = true;
		if (this._closed) {
			this._finishInvocation(entry, { type: "failed", code: "unavailable" });
			this._retireInvocation(entry);
			return;
		}
		this._pendingInvocations.push(entry);
		this._pump();
	}

	_cancelInvocation(entry: IDefaultRpcInvocationEntry): void {
		if (entry.retired || entry.publicFinished) {
			return;
		}
		this._finishInvocation(entry, { type: "failed", code: "canceled" });
		if (!entry.admitted) {
			this._retireInvocation(entry);
			return;
		}
		this._queueSemantic(
			Object.freeze({
				kind: "cancel",
				callId: entry.callId as string,
			}) as DefaultRpcSemanticMessage,
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
				this._sendUnsequenced(binding, { kind: "pong" });
			} else {
				this._pingDue = false;
				this._sendUnsequenced(binding, { kind: "ping" });
			}
			return;
		}

		if (replaySequence !== undefined) {
			this._replayBarrier.shift();
			const replay = this._replay.get(replaySequence);
			if (replay === undefined) {
				this._fault(
					"resource-fault",
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
				kind: "ack",
				ackThrough: this._receivedThrough,
			});
		}
		this._checkGracefulShutdown();
	}

	_admitInvocation(
		binding: IDefaultRpcBinding,
		entry: IDefaultRpcInvocationEntry,
	): void {
		if (
			this._outgoingCallOrdinalExhausted ||
			!Number.isSafeInteger(this._nextOutgoingCallOrdinal) ||
			this._nextOutgoingSequence > DEFAULT_RPC_LAST_ORDINARY_SEQUENCE
		) {
			this._beginCounterDrain();
			return;
		}
		const callId = String(this._nextOutgoingCallOrdinal);
		const message = Object.freeze({
			kind: "call",
			callId,
			service: entry.request.service,
			method: entry.request.method,
			args: entry.request.args.value,
		}) as DefaultRpcCallMessage;
		const sequence = this._nextOutgoingSequence;
		const replay = this._reserveReplayEntry(message);
		if (replay === undefined) {
			this._pendingInvocations.shift();
			this._finishInvocation(entry, { type: "failed", code: "unavailable" });
			this._retireInvocation(entry);
			this._pump();
			return;
		}
		let encoded: Uint8Array;
		try {
			encoded = encodeDefaultRpcRecord(this._createEnvelope(sequence, message));
		} catch {
			this._releaseReplayEntry(replay);
			this._pendingInvocations.shift();
			this._finishInvocation(entry, { type: "failed", code: "unavailable" });
			this._retireInvocation(entry);
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
		entry.seq = sequence;
		this._releasePendingInvocationCharge(entry);
		this._outgoingCalls.set(callId, entry);
		this._retainReplayEntry(sequence, replay);
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
		if (this._outgoingCallOrdinalExhausted) {
			this._beginCounterDrain();
		}
	}

	_admitSemantic(
		binding: IDefaultRpcBinding,
		queued: IDefaultRpcQueuedSemantic,
	): void {
		const { message, replay } = queued;
		if (
			this._outgoingSequenceExhausted ||
			!Number.isSafeInteger(this._nextOutgoingSequence)
		) {
			this._releaseReplayEntry(replay);
			this._terminateRetainedSession(
				"counter-exhaustion",
				new Error("Default RPC sequence counter is exhausted."),
			);
			return;
		}
		const sequence = this._nextOutgoingSequence;
		let encoded: Uint8Array;
		try {
			encoded = encodeDefaultRpcRecord(this._createEnvelope(sequence, message));
		} catch (error) {
			this._releaseReplayEntry(replay);
			this._fault(
				"resource-fault",
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
		this._retainReplayEntry(sequence, replay);
		if (message.kind === "result" || message.kind === "error") {
			const incoming = this._incomingCalls.get(message.callId);
			if (incoming?.terminalSelected) {
				incoming.terminalSequence = sequence;
			}
		}
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_sendEnvelope(
		binding: IDefaultRpcBinding,
		sequence: number,
		message: DefaultRpcSemanticMessage,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = encodeDefaultRpcRecord(this._createEnvelope(sequence, message));
		} catch (error) {
			this._fault(
				"resource-fault",
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
		message: DefaultRpcSemanticMessage,
	): IDefaultRpcReplayEntry | undefined {
		let maximumEnvelope: Uint8Array;
		try {
			maximumEnvelope = encodeDefaultRpcRecord({
				kind: "message",
				seq: Number.MAX_SAFE_INTEGER,
				ackThrough: Number.MAX_SAFE_INTEGER,
				message,
			});
		} catch {
			return undefined;
		}
		const ordinaryCharge = maximumEnvelope.byteLength + 256;
		const resourceClass =
			message.kind === "error"
				? "terminal"
				: message.kind === "cancel"
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
		const isTerminalPayload = message.kind === "result";
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
			this._ordinaryReplayCount += 1;
			this._replayBytes += charge;
			if (isTerminalPayload) {
				this._terminalPayloadCount += 1;
				this._terminalReplayBytes += charge;
			}
		}
		return { message, charge, resourceClass, released: false };
	}

	_retainReplayEntry(sequence: number, replay: IDefaultRpcReplayEntry): void {
		this._replay.set(sequence, replay);
	}

	_releaseReplayEntry(replay: IDefaultRpcReplayEntry): void {
		if (replay.released) {
			return;
		}
		replay.released = true;
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
		if (replay.message.kind === "result") {
			this._terminalPayloadCount -= 1;
			this._terminalReplayBytes -= replay.charge;
		}
	}

	_createEnvelope(
		sequence: number,
		message: DefaultRpcSemanticMessage,
	): DefaultRpcMessageEnvelope {
		return (
			this._ackDirty
				? {
						kind: "message",
						seq: sequence,
						ackThrough: this._receivedThrough,
						message,
					}
				: { kind: "message", seq: sequence, message }
		) as DefaultRpcMessageEnvelope;
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
		binding: IDefaultRpcBinding,
		record: DefaultRpcJsonRecord,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = encodeDefaultRpcRecord(record);
		} catch (error) {
			this._fault(
				"protocol-fault",
				error instanceof Error
					? error
					: new Error("Default RPC control record cannot be encoded."),
			);
			return;
		}
		this._sendEncoded(binding, encoded);
	}

	_sendEncoded(binding: IDefaultRpcBinding, encoded: Uint8Array): void {
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
				"protocol-fault",
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

	_finishInvocation(
		entry: IDefaultRpcInvocationEntry,
		outcome: RpcCallOutcome,
	): void {
		if (entry.publicFinished) {
			return;
		}
		entry.publicFinished = true;
		entry.sink.finish(outcome);
	}

	_retireInvocation(entry: IDefaultRpcInvocationEntry): void {
		if (entry.retired) {
			return;
		}
		entry.retired = true;
		this._releasePendingInvocationCharge(entry);
		this._invocations.delete(entry);
		if (entry.callId !== undefined) {
			this._outgoingCalls.delete(entry.callId);
		}
		this._invocationCount -= 1;
		this._checkGracefulShutdown();
	}

	_releasePendingInvocationCharge(entry: IDefaultRpcInvocationEntry): void {
		if (!entry.pendingCharged) {
			return;
		}
		entry.pendingCharged = false;
		this._pendingInvocationBytes -= entry.pendingCharge;
	}

	_beginCounterDrain(): void {
		if (this._closed || this._counterDraining) {
			return;
		}
		this._counterDraining = true;
		this._draining = true;
		this._sessionHost?.transition({
			type: "draining",
			reason: "counter-exhaustion",
		});
		this._counterDrainTimer = setTimeout(() => {
			this._counterDrainTimer = undefined;
			this._terminateRetainedSession(
				"counter-exhaustion",
				new Error("Default RPC counter drain deadline expired."),
			);
		}, this._host.policy.shutdownDeadlineMs);
		for (const entry of [...this._invocations]) {
			if (!entry.admitted) {
				this._finishInvocation(entry, { type: "failed", code: "unavailable" });
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
		this._stopHealthTimer();
		this._healthStallGraceUntil = 0;
		this._pingDue = false;
		this._pongDue = false;
		binding?.endpoint.fenceAndClose();
		if (this._counterDraining) {
			this._terminateRetainedSession("counter-exhaustion", cause);
			return;
		}
		if (this._draining) {
			this._terminateRetainedSession("forced-close", cause);
			return;
		}
		if (!this._recovering) {
			this._recovering = true;
			this._sessionHost?.transition({ type: "recovering", cause });
		}
		if (this._recoveryTimer === undefined) {
			this._recoveryDeadline = Date.now() + this._host.policy.recoveryGraceMs;
			this._recoveryTimer = setTimeout(
				() => this._expireRecovery(),
				this._host.policy.recoveryGraceMs,
			);
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
		for (const entry of [...this._invocations]) {
			this._finishInvocation(
				entry,
				entry.admitted
					? { type: "failed", code: "outcome-unknown" }
					: { type: "failed", code: "unavailable" },
			);
			this._retireInvocation(entry);
		}
		for (const incoming of this._incomingCalls.values()) {
			if (!incoming.terminalSelected && incoming.call !== undefined) {
				incoming.terminalSelected = true;
				incoming.call.finish({ type: "session-terminated" });
			}
		}
		this._closed = true;
		this._clearTimers();
		this._proofKey = undefined;
		this._sessionHost?.transition({
			type: "closed",
			reason: "recovery-expired",
		});
		this._onTerminal(this);
	}

	_terminateRetainedSession(
		reason:
			| "continuity-failure"
			| "counter-exhaustion"
			| "forced-close"
			| "remote-terminated",
		cause?: Error,
	): void {
		if (this._closed) {
			return;
		}
		for (const entry of [...this._invocations]) {
			this._finishInvocation(
				entry,
				entry.admitted
					? { type: "failed", code: "outcome-unknown" }
					: { type: "failed", code: "unavailable" },
			);
			this._retireInvocation(entry);
		}
		for (const incoming of this._incomingCalls.values()) {
			if (!incoming.terminalSelected && incoming.call !== undefined) {
				incoming.terminalSelected = true;
				incoming.call.finish({ type: "session-terminated" });
			}
		}
		this._closed = true;
		this._clearTimers();
		this._binding?.endpoint.fenceAndClose();
		this._binding = undefined;
		this._proofKey = undefined;
		this._sessionHost?.transition({ type: "closed", reason, cause });
		this._onTerminal(this);
		this._resolveShutdown?.();
		this._resolveShutdown = undefined;
	}

	_terminalFromPeer(): void {
		if (this._closed) {
			return;
		}
		for (const entry of [...this._invocations]) {
			this._finishInvocation(
				entry,
				entry.admitted
					? { type: "failed", code: "outcome-unknown" }
					: { type: "failed", code: "unavailable" },
			);
			this._retireInvocation(entry);
		}
		for (const incoming of this._incomingCalls.values()) {
			if (!incoming.terminalSelected && incoming.call !== undefined) {
				incoming.terminalSelected = true;
				incoming.call.finish({ type: "session-terminated" });
			}
		}
		this._closed = true;
		this._clearTimers();
		this._binding?.endpoint.fenceAndClose();
		this._binding = undefined;
		this._proofKey = undefined;
		this._sessionHost?.transition({
			type: "closed",
			reason: "remote-terminated",
		});
		this._onTerminal(this);
	}

	_fault(reason: "protocol-fault" | "resource-fault", error: Error): void {
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

	_startHealthTimer(binding: IDefaultRpcBinding): void {
		this._stopHealthTimer();
		const now = Date.now();
		this._healthStallGraceUntil = 0;
		this._lastInboundActivityAt = now;
		this._nextProbeAt = now + this._host.policy.activityProbeIntervalMs;
		this._scheduleHealthTimer(binding);
	}

	_recordInboundActivity(binding: IDefaultRpcBinding): void {
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

	_scheduleHealthTimer(binding: IDefaultRpcBinding): void {
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

	_healthTimerFired(binding: IDefaultRpcBinding): void {
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
				this._terminateRetainedSession("counter-exhaustion");
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
			encoded = encodeDefaultRpcRecord({ kind: "close" });
		} catch {
			this.forceClose();
			return;
		}
		void binding.endpoint.sendNow(encoded).then(
			() => {
				if (this._counterDraining) {
					this._terminateRetainedSession("counter-exhaustion");
				} else {
					this.forceClose();
				}
			},
			(error: unknown) => {
				if (this._counterDraining) {
					this._terminateRetainedSession(
						"counter-exhaustion",
						error instanceof Error ? error : undefined,
					);
				} else {
					this.forceClose();
				}
			},
		);
	}
}
