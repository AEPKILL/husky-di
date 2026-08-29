/**
 * @overview THROWAWAY Streaming Protocol implementor seam and contract probes.
 *
 * Design evidence only. This is not production code, a package export, or a
 * normative specification.
 *
 * @author AEPKILL
 * @created 2026-08-23 00:00:00
 */

import type { Observable } from "rxjs";

type ProbeObserver<T> = {
	readonly next?: (value: T) => void;
	readonly error?: (error: unknown) => void;
	readonly complete?: () => void;
};

class ProbeSubject<T> {
	readonly #observers = new Set<ProbeObserver<T>>();
	#stopped = false;

	public asObservable(): Observable<T> {
		return this as unknown as Observable<T>;
	}

	public subscribe(observer: ProbeObserver<T>): { unsubscribe(): void } {
		if (this.#stopped) {
			observer.complete?.();
			return { unsubscribe: () => undefined };
		}
		this.#observers.add(observer);
		return { unsubscribe: () => this.#observers.delete(observer) };
	}

	public next(value: T): void {
		for (const observer of this.#observers) {
			observer.next?.(value);
		}
	}

	public error(error: unknown): void {
		if (this.#stopped) {
			return;
		}
		this.#stopped = true;
		for (const observer of this.#observers) {
			observer.error?.(error);
		}
		this.#observers.clear();
	}

	public complete(): void {
		if (this.#stopped) {
			return;
		}
		this.#stopped = true;
		for (const observer of this.#observers) {
			observer.complete?.();
		}
		this.#observers.clear();
	}
}

// Existing complete-message Transport seam, intentionally unchanged.
export interface IRpcConnection {
	readonly message$: Observable<Uint8Array>;
	send(message: Uint8Array): Promise<void>;
	close(): Promise<void>;
}

export type RpcApplicationValue =
	| null
	| boolean
	| string
	| number
	| readonly RpcApplicationValue[]
	| IRpcApplicationRecord;

export interface IRpcApplicationRecord {
	readonly [key: string]: RpcApplicationValue;
}

declare const RPC_APPLICATION_SNAPSHOT_TYPE: unique symbol;

export interface IRpcApplicationSnapshot<
	T extends RpcApplicationValue = RpcApplicationValue,
> {
	readonly value: T;
	readonly weight: number;
	readonly [RPC_APPLICATION_SNAPSHOT_TYPE]: never;
}

export interface IRpcApplicationArgumentsSnapshot
	extends IRpcApplicationSnapshot<readonly RpcApplicationValue[]> {}

export interface IRpcProtocolRuntimePolicy {
	readonly maxSessions: number;
	readonly maxHandshakes: number;
	readonly maxApplicationWorkPerSession: number;
	readonly maxApplicationWorkTotal: number;
	readonly maxActiveStreamsPerSession: number;
	readonly maxActiveStreamsTotal: number;
	readonly maxRetainedBytesPerSession: number;
	readonly maxRetainedBytesTotal: number;
	readonly maxHandlersPerSession: number;
	readonly maxHandlersTotal: number;
	readonly ackDelayMs: number;
	readonly activityProbeIntervalMs: number;
	readonly silenceTimeoutMs: number;
	readonly sendProgressTimeoutMs: number;
	readonly bindingAttemptTimeoutMs: number;
	readonly recoveryGraceMs: number;
	readonly shutdownDeadlineMs: number;
}

export type RpcProtocolFaultReason = "protocol-fault" | "resource-fault";

export interface IRpcRetainedBytesReservation {
	release(): void;
}

export interface IRpcProtocolHost {
	readonly policy: IRpcProtocolRuntimePolicy;
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot;
	normalizeApplicationArguments(
		value: unknown,
	): IRpcApplicationArgumentsSnapshot;
	applicationValuesEqual(
		left: IRpcApplicationSnapshot,
		right: IRpcApplicationSnapshot,
	): boolean;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

// Existing unary ports remain beside, rather than underneath, streaming.
export interface IRpcProtocolInvocationRequest {
	readonly service: string;
	readonly member: string;
	readonly args: IRpcApplicationArgumentsSnapshot;
}

export type RpcCallOutcome =
	| { readonly type: "returned-void" }
	| { readonly type: "returned"; readonly value: IRpcApplicationSnapshot }
	| {
			readonly type: "failed";
			readonly code:
				| "canceled"
				| "unavailable"
				| "outcome-unknown"
				| "handler-failed"
				| "unknown-service"
				| "unknown-member";
	  };

export interface IRpcProtocolInvocationSink {
	finish(outcome: RpcCallOutcome): void;
}

export interface IRpcProtocolInvocationReservation {
	commit(sink: IRpcProtocolInvocationSink): IRpcProtocolInvocation;
	release(): void;
}

export interface IRpcProtocolInvocation {
	start(): void;
	cancel(): void;
}

export interface IRpcProtocolIncomingCallRequest {
	readonly service: string;
	readonly member: string;
	readonly args: IRpcApplicationArgumentsSnapshot;
}

export interface IRpcProtocolIncomingCall {
	finish(
		outcome: RpcCallOutcome | { readonly type: "session-terminated" },
	): void;
}

export interface IRpcProtocolIncomingCallReservation {
	commit(): IRpcProtocolIncomingCall;
	release(): void;
}

export type RpcProtocolIncomingCallReservation =
	| {
			readonly kind: "handler";
			readonly reservation: IRpcProtocolIncomingCallReservation;
	  }
	| {
			readonly kind: "unknown";
			readonly code: "unknown-service" | "unknown-member";
			readonly reservation: IRpcProtocolIncomingCallReservation;
	  };

// One request union distinguishes the two real acquisition recipes. Everything
// after route capture uses the same reservation and lifecycle ports.
export type RpcProtocolStreamRequest =
	| {
			readonly service: string;
			readonly member: string;
			readonly kind: "stream-method";
			readonly args: IRpcApplicationArgumentsSnapshot;
	  }
	| {
			readonly service: string;
			readonly member: string;
			readonly kind: "stream-property";
	  };

export type RpcStreamFailure =
	| "unavailable"
	| "outcome-unknown"
	| "handler-failed"
	| "unknown-service"
	| "unknown-member"
	| "overflow";

export type RpcStreamOutcome =
	| { readonly type: "completed" }
	| { readonly type: "canceled" }
	| { readonly type: "failed"; readonly code: RpcStreamFailure };

export type RpcStreamItemEffect = "rearm" | "closed";

export interface IRpcProtocolProjection<TResult = void> {
	/** Consumes the frozen Framework effect after Protocol commits disposition. */
	commit(): TResult;
}

/** Framework-owned Subscriber-side projection port. */
export interface IRpcProtocolSubscriberSink {
	/** Freezes one deliver/suppress effect before Protocol mutates disposition. */
	reserveItem(
		value: IRpcApplicationSnapshot,
	): IRpcProtocolProjection<RpcStreamItemEffect>;
	/** Freezes one terminal/suppress effect before Protocol mutates terminal. */
	reserveTerminal(outcome: RpcStreamOutcome): IRpcProtocolProjection;
}

export interface IRpcProtocolStreamReservation {
	/** Commit establishes Local Admission and exactly one backed initial credit. */
	commit(sink: IRpcProtocolSubscriberSink): IRpcProtocolStream;
	release(): void;
}

export interface IRpcProtocolStream {
	start(): void;
	cancel(): void;
}

export type RpcSourceTerminal =
	| { readonly type: "completed" }
	| { readonly type: "failed"; readonly code: "handler-failed" };

/** One Source Emission position reserved before Framework retains its raw value. */
export interface IRpcProtocolSourceEmissionReservation {
	/** Normalized value plus ordinary retained capacity becomes a Stream Item. */
	commit(value: IRpcApplicationSnapshot): void;
	/** Normalization failure selects the safe handler-failed terminal. */
	fail(): void;
}

/** Protocol-owned port called by the Framework's package-private source bridge. */
export interface IRpcProtocolSourceSink {
	/** undefined means this emission already selected overflow and fenced source. */
	reserveEmission(): IRpcProtocolSourceEmissionReservation | undefined;
	finish(outcome: RpcSourceTerminal): void;
}

export type RpcIncomingStreamTerminal =
	| { readonly type: "completed" }
	| { readonly type: "canceled" }
	| {
			readonly type: "failed";
			readonly code:
				| "handler-failed"
				| "unknown-service"
				| "unknown-member"
				| "overflow";
	  }
	| { readonly type: "session-terminated" };

/** Framework-owned source lifecycle and one-shot teardown control. */
export interface IRpcProtocolIncomingStream {
	/**
	 * Fences the source and invokes onReleased once its actual teardown attempt
	 * returns or throws. A synchronous terminal may precede subscribe() return.
	 */
	finish(outcome: RpcIncomingStreamTerminal, onReleased: () => void): void;
}

export interface IRpcProtocolIncomingSourceReservation {
	commit(source: IRpcProtocolSourceSink): IRpcProtocolIncomingStream;
	release(): void;
}

export interface IRpcProtocolIncomingUnknownStreamReservation {
	commit(): IRpcProtocolIncomingStream;
	release(): void;
}

export type RpcProtocolIncomingStreamReservation =
	| {
			readonly kind: "source";
			readonly reservation: IRpcProtocolIncomingSourceReservation;
	  }
	| {
			readonly kind: "unknown";
			readonly code: "unknown-service" | "unknown-member";
			readonly reservation: IRpcProtocolIncomingUnknownStreamReservation;
	  };

export interface IRpcProtocolSession {
	reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined;
	reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined;
	forceClose(): void;
}

export type RpcProtocolSessionTransition =
	| { readonly type: "draining"; readonly reason: "counter-exhaustion" }
	| { readonly type: "recovering"; readonly cause?: Error }
	| { readonly type: "recovered" }
	| {
			readonly type: "closed";
			readonly reason:
				| "graceful-shutdown"
				| "forced-close"
				| "remote-terminated"
				| "recovery-expired"
				| "continuity-failure"
				| "counter-exhaustion";
			readonly cause?: Error;
	  };

export interface IRpcProtocolSessionHost {
	reserveIncomingCall(
		request: IRpcProtocolIncomingCallRequest,
	): RpcProtocolIncomingCallReservation | undefined;
	reserveIncomingStream(
		request: RpcProtocolStreamRequest,
	): RpcProtocolIncomingStreamReservation | undefined;
	transition(transition: RpcProtocolSessionTransition): void;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcProtocolConnectorHost extends IRpcProtocolHost {
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolAcceptorHost extends IRpcProtocolHost {
	admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
}

export interface IRpcProtocolRoleRuntime {
	shutdown(): Promise<void>;
	close(): void;
	cleanup(): Promise<void>;
}

export interface IRpcProtocolConnectorRuntime extends IRpcProtocolRoleRuntime {
	bind(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocolAcceptorRuntime extends IRpcProtocolRoleRuntime {
	accept(connection: IRpcConnection, signal: AbortSignal): Promise<void>;
}

export interface IRpcProtocol {
	createConnector(
		host: IRpcProtocolConnectorHost,
	): IRpcProtocolConnectorRuntime;
	createAcceptor(host: IRpcProtocolAcceptorHost): IRpcProtocolAcceptorRuntime;
}

const PROTOTYPE_POLICY: IRpcProtocolRuntimePolicy = Object.freeze({
	maxSessions: 64,
	maxHandshakes: 16,
	maxApplicationWorkPerSession: 256,
	maxApplicationWorkTotal: 1_024,
	maxActiveStreamsPerSession: 1,
	maxActiveStreamsTotal: 64,
	maxRetainedBytesPerSession: 32 * 1024 * 1024,
	maxRetainedBytesTotal: 64 * 1024 * 1024,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 64,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
});

const TRACE: string[] = [];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function trace(value: string): void {
	TRACE.push(value);
}

class InstrumentedCompleteMessageConnection implements IRpcConnection {
	readonly #messages = new ProbeSubject<Uint8Array>();
	#blocked = true;
	#closed = false;
	#closeTask: Promise<void> | undefined;
	#pending:
		| {
				readonly bytes: Uint8Array;
				readonly deferred: PromiseWithResolvers<void>;
		  }
		| undefined;

	public readonly message$ = this.#messages.asObservable();
	public readonly admittedMessages: Uint8Array[] = [];
	public sendCalls = 0;
	public maxUnsettledSends = 0;

	public get borrowedMessage(): Uint8Array | undefined {
		return this.#pending?.bytes;
	}

	public send(message: Uint8Array): Promise<void> {
		if (this.#closed) {
			return Promise.reject(new Error("Connection is closed."));
		}
		if (this.#pending !== undefined) {
			return Promise.reject(new Error("Only one send may be unsettled."));
		}
		if (message.byteLength > 1_048_576) {
			return Promise.reject(new Error("Complete message exceeds 1 MiB."));
		}
		const deferred = Promise.withResolvers<void>();
		this.#pending = { bytes: message, deferred };
		this.sendCalls += 1;
		this.maxUnsettledSends = Math.max(this.maxUnsettledSends, 1);
		trace("transport:send-borrowed");
		if (!this.#blocked) {
			this.#admitPending();
		}
		return deferred.promise;
	}

	public close(): Promise<void> {
		this.#closeTask ??= this.#closeNow();
		return this.#closeTask;
	}

	public unblock(): void {
		this.#blocked = false;
		this.#admitPending();
	}

	public block(): void {
		this.#blocked = true;
	}

	public emitInbound(message: Uint8Array): void {
		if (!this.#closed) {
			this.#messages.next(message.slice());
		}
	}

	public fail(error: Error): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		const pending = this.#pending;
		this.#pending = undefined;
		pending?.deferred.reject(error);
		this.#messages.error(error);
	}

	#closeNow(): Promise<void> {
		this.#closed = true;
		const pending = this.#pending;
		this.#pending = undefined;
		pending?.deferred.reject(new Error("Connection closed during send."));
		this.#messages.complete();
		return Promise.resolve();
	}

	#admitPending(): void {
		if (this.#blocked || this.#pending === undefined) {
			return;
		}
		const pending = this.#pending;
		this.#pending = undefined;
		this.admittedMessages.push(pending.bytes.slice());
		trace("transport:local-admission");
		pending.deferred.resolve(undefined);
	}
}

type RetainedFrame = {
	readonly id: number;
	readonly kind: "start" | "item" | "credit" | "cancel" | "terminal";
	readonly bytes: Uint8Array;
	locallyAdmitted: boolean;
};

type OutgoingStreamState = {
	readonly request: RpcProtocolStreamRequest;
	readonly sink: IRpcProtocolSubscriberSink;
	id: number | undefined;
	started: boolean;
	observing: boolean;
	terminal: boolean;
	receivedItems: number;
	creditHorizon: number;
};

type IncomingStreamState = {
	readonly id: number;
	credit: number;
	admittedItems: number;
	pendingEmission: boolean;
	terminal: RpcIncomingStreamTerminal | undefined;
	sourceControl: IRpcProtocolIncomingStream | undefined;
	finishRequested: boolean;
	released: boolean;
};

class MinimalProtocolSession implements IRpcProtocolSession {
	readonly #runtime: MinimalRoleRuntime;
	readonly #host: IRpcProtocolHost;
	#sessionHost: IRpcProtocolSessionHost | undefined;
	#connection: IRpcConnection | undefined;
	#bindingGeneration = 0;
	#nextStreamId = 1;
	#nextFrameId = 1;
	#reverseReceipt = 0;
	#ordinaryItemHeadroom = 1;
	#protectedTerminalRetentions = 0;
	#draining = false;
	#forced = false;
	#pendingOutgoing = new Set<OutgoingStreamState>();
	#outgoing = new Map<number, OutgoingStreamState>();
	#incoming = new Map<number, IncomingStreamState>();
	#retained = new Map<number, RetainedFrame>();
	#sendQueue: number[] = [];
	#pendingSend:
		| {
				readonly frameId: number;
				readonly generation: number;
		  }
		| undefined;
	#drain = Promise.withResolvers<void>();

	public constructor(runtime: MinimalRoleRuntime, host: IRpcProtocolHost) {
		this.#runtime = runtime;
		this.#host = host;
	}

	public get retainedFrameCount(): number {
		return this.#retained.size;
	}

	public get reverseReceipt(): number {
		return this.#reverseReceipt;
	}

	public get activeSourceCount(): number {
		return this.#incoming.size;
	}

	public get ordinaryItemHeadroom(): number {
		return this.#ordinaryItemHeadroom;
	}

	public get protectedTerminalRetentions(): number {
		return this.#protectedTerminalRetentions;
	}

	public attachHost(host: IRpcProtocolSessionHost): void {
		this.#sessionHost = host;
	}

	public installConnection(connection: IRpcConnection): void {
		this.#connection = connection;
		this.#bindingGeneration += 1;
		this.#pendingSend = undefined;
		this.#sendQueue = [...this.#retained.keys()].sort(
			(left, right) => left - right,
		);
		trace("protocol:binding-installed");
		this.#pump();
	}

	public loseConnection(connection: IRpcConnection, error?: Error): void {
		if (connection !== this.#connection || this.#forced) {
			return;
		}
		this.#connection = undefined;
		this.#pendingSend = undefined;
		trace("protocol:recovering-retained");
		this.#runtime.enterRecovery(error);
	}

	public receive(message: Uint8Array): void {
		const [prefix, kind, idText, ordinalText, ...payloadParts] = decoder
			.decode(message)
			.split("|");
		if (prefix !== "peer") {
			this.#sessionHost?.fault(
				"protocol-fault",
				new Error("Unknown custom Protocol message."),
			);
			return;
		}
		const id = Number(idText);
		if (kind === "item") {
			const ordinal = Number(ordinalText);
			const state = this.#outgoing.get(id);
			if (
				state === undefined ||
				state.terminal ||
				ordinal !== state.receivedItems + 1 ||
				ordinal > state.creditHorizon
			) {
				this.#sessionHost?.fault(
					"protocol-fault",
					new Error("Unexpected or over-credit custom stream item."),
				);
				return;
			}
			const snapshot = this.#host.normalizeApplicationValue(
				payloadParts.join("|"),
			);
			const projection = state.sink.reserveItem(snapshot);
			trace("framework:subscriber-item-projection-reserved");
			state.receivedItems = ordinal;
			trace("protocol:subscriber-disposition-committed");
			trace("protocol:subscriber-receipt-committed");
			const effect = projection.commit();
			if (effect === "closed") {
				state.observing = false;
			}
			if (effect === "rearm" && state.observing && !this.#forced) {
				state.creditHorizon += 1;
				trace("protocol:credit-rearmed-after-effect");
				this.#retainFrame("credit", id, String(state.creditHorizon));
			}
			return;
		}
		if (kind === "terminal") {
			const state = this.#outgoing.get(id);
			if (state === undefined || Number(ordinalText) !== state.receivedItems) {
				this.#sessionHost?.fault(
					"protocol-fault",
					new Error("Unexpected custom stream terminal boundary."),
				);
				return;
			}
			const outcome: RpcStreamOutcome =
				payloadParts[0] === "completed"
					? { type: "completed" }
					: { type: "failed", code: "handler-failed" };
			const projection = state.sink.reserveTerminal(outcome);
			trace("framework:subscriber-terminal-projection-reserved");
			state.terminal = true;
			state.observing = false;
			this.#outgoing.delete(id);
			trace("protocol:subscriber-terminal-committed");
			trace("protocol:subscriber-terminal-receipt-committed");
			projection.commit();
			this.#checkDrained();
			return;
		}
		this.#sessionHost?.fault(
			"protocol-fault",
			new Error("Unsupported custom Protocol message kind."),
		);
	}

	public reserveInvocation(
		_request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		return undefined;
	}

	public reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		if (this.#draining || this.#forced) {
			return undefined;
		}
		let open = true;
		return {
			commit: (sink) => {
				assert(open, "Stream reservation must have one winner.");
				open = false;
				const state: OutgoingStreamState = {
					request,
					sink,
					id: undefined,
					started: false,
					observing: true,
					terminal: false,
					receivedItems: 0,
					creditHorizon: 1,
				};
				this.#pendingOutgoing.add(state);
				trace("protocol:local-stream-admission");
				return new MinimalOutgoingStream(this, state);
			},
			release: () => {
				assert(open, "Stream reservation must have one winner.");
				open = false;
			},
		};
	}

	public startOutgoing(state: OutgoingStreamState): void {
		assert(
			!state.started && !state.terminal && state.observing,
			"Outgoing stream start is one-shot.",
		);
		state.started = true;
		state.id = this.#nextStreamId;
		this.#nextStreamId += 1;
		this.#pendingOutgoing.delete(state);
		this.#outgoing.set(state.id, state);
		trace("protocol:outgoing-stream-admitted");
		this.#retainFrame(
			"start",
			state.id,
			`${state.request.kind}|${state.creditHorizon}`,
		);
	}

	public cancelOutgoing(state: OutgoingStreamState): void {
		if (!state.observing || state.terminal) {
			return;
		}
		state.observing = false;
		if (!state.started || state.id === undefined) {
			state.terminal = true;
			this.#pendingOutgoing.delete(state);
			trace("protocol:pending-stream-retracted");
			this.#checkDrained();
			return;
		}
		this.#retainFrame("cancel", state.id, "intent");
	}

	public admitIncomingStream(
		id: number,
		request: RpcProtocolStreamRequest,
	): void {
		if (
			this.#draining ||
			this.#forced ||
			this.#incoming.size >= this.#host.policy.maxActiveStreamsPerSession
		) {
			trace("protocol:remote-resource-rejection-before-route");
			this.#retainFrame("terminal", id, "unavailable");
			return;
		}
		const reserved = this.#sessionHost?.reserveIncomingStream(request);
		if (reserved === undefined) {
			this.#retainFrame("terminal", id, "unavailable");
			return;
		}
		if (reserved.kind === "unknown") {
			trace("protocol:remote-semantic-rejection-committed");
			const control = reserved.reservation.commit();
			control.finish({ type: "failed", code: reserved.code }, () => undefined);
			this.#retainFrame("terminal", id, reserved.code);
			return;
		}
		const state: IncomingStreamState = {
			id,
			credit: 1,
			admittedItems: 0,
			pendingEmission: false,
			terminal: undefined,
			sourceControl: undefined,
			finishRequested: false,
			released: false,
		};
		this.#incoming.set(id, state);
		const source = this.#createSourceSink(state);
		trace(`protocol:remote-stream-admission-committed:${request.kind}`);
		state.sourceControl = reserved.reservation.commit(source);
		this.#requestSourceFinish(state);
	}

	public updateReverseReceipt(value: number): void {
		this.#reverseReceipt = value;
		trace("protocol:reverse-receipt-updated");
	}

	public acknowledgeAllRetainedFrames(): void {
		this.#retained.clear();
		this.#sendQueue = [];
		trace("protocol:evidence-retired");
		this.#checkDrained();
	}

	public beginShutdown(): Promise<void> {
		this.#draining = true;
		trace("protocol:graceful-gate-closed");
		this.#checkDrained();
		return this.#drain.promise;
	}

	public forceClose(): void {
		if (this.#forced) {
			return;
		}
		this.#forced = true;
		this.#draining = true;
		trace("protocol:force-generation-committed");

		const effects: Array<() => void> = [];
		for (const state of this.#pendingOutgoing) {
			const projection = state.observing
				? state.sink.reserveTerminal({
						type: "failed",
						code: "unavailable",
					})
				: undefined;
			state.observing = false;
			state.terminal = true;
			if (projection !== undefined) {
				effects.push(() => projection.commit());
			}
		}
		this.#pendingOutgoing.clear();
		for (const state of this.#outgoing.values()) {
			const projection = state.observing
				? state.sink.reserveTerminal({
						type: "failed",
						code: "outcome-unknown",
					})
				: undefined;
			state.observing = false;
			state.terminal = true;
			if (projection !== undefined) {
				effects.push(() => projection.commit());
			}
		}
		this.#outgoing.clear();
		for (const state of this.#incoming.values()) {
			if (state.terminal === undefined) {
				state.terminal = { type: "session-terminated" };
				effects.push(() => this.#requestSourceFinish(state));
			}
		}

		this.#retained.clear();
		this.#sendQueue = [];
		this.#pendingSend = undefined;
		trace("protocol:all-streams-fenced-before-effects");
		for (const effect of effects) {
			effect();
		}
		this.#checkDrained();
	}

	#createSourceSink(state: IncomingStreamState): IRpcProtocolSourceSink {
		return {
			reserveEmission: () => {
				if (state.terminal !== undefined || this.#forced) {
					return undefined;
				}
				if (state.credit === 0) {
					this.#selectIncomingTerminal(state, {
						type: "failed",
						code: "overflow",
					});
					return undefined;
				}
				assert(!state.pendingEmission, "Only one W=1 emission may be staged.");
				state.credit -= 1;
				assert(
					this.#ordinaryItemHeadroom > 0,
					"Ordinary item headroom must back each granted emission.",
				);
				this.#ordinaryItemHeadroom -= 1;
				trace("protocol:ordinary-item-headroom-consumed");
				state.pendingEmission = true;
				trace("protocol:source-emission-reserved");
				let open = true;
				return {
					commit: (value) => {
						assert(open, "Emission reservation must have one winner.");
						open = false;
						state.pendingEmission = false;
						state.admittedItems += 1;
						trace("protocol:stream-item-admission-committed");
						this.#retainFrame(
							"item",
							state.id,
							`${state.admittedItems}|${String(value.value)}`,
						);
					},
					fail: () => {
						assert(open, "Emission reservation must have one winner.");
						open = false;
						state.pendingEmission = false;
						this.#selectIncomingTerminal(state, {
							type: "failed",
							code: "handler-failed",
						});
					},
				};
			},
			finish: (outcome) => {
				this.#selectIncomingTerminal(
					state,
					outcome.type === "completed"
						? { type: "completed" }
						: { type: "failed", code: "handler-failed" },
				);
			},
		};
	}

	#selectIncomingTerminal(
		state: IncomingStreamState,
		outcome: RpcIncomingStreamTerminal,
	): void {
		if (state.terminal !== undefined) {
			return;
		}
		state.terminal = outcome;
		trace(
			`protocol:source-terminal-committed:${
				outcome.type === "failed" ? outcome.code : outcome.type
			}`,
		);
		trace(`protocol:source-terminal-boundary:${state.admittedItems}`);
		this.#retainFrame(
			"terminal",
			state.id,
			`${state.admittedItems}|${
				outcome.type === "failed" ? outcome.code : outcome.type
			}`,
		);
		this.#requestSourceFinish(state);
	}

	#requestSourceFinish(state: IncomingStreamState): void {
		const control = state.sourceControl;
		const terminal = state.terminal;
		if (
			control === undefined ||
			terminal === undefined ||
			state.finishRequested
		) {
			return;
		}
		state.finishRequested = true;
		control.finish(terminal, () => {
			assert(!state.released, "Source release completion is one-shot.");
			state.released = true;
			this.#incoming.delete(state.id);
			trace("protocol:source-release-completion-observed");
			this.#checkDrained();
		});
	}

	#retainFrame(
		kind: RetainedFrame["kind"],
		streamId: number,
		payload: string,
	): void {
		if (kind === "terminal") {
			this.#protectedTerminalRetentions += 1;
			trace("protocol:protected-terminal-retained");
		}
		assert(
			this.#retained.size < 32,
			"Prototype retained frame bound exceeded.",
		);
		const id = this.#nextFrameId;
		this.#nextFrameId += 1;
		const bytes = encoder.encode(
			`custom-v1|${id}|${kind}|${streamId}|${payload}`,
		);
		this.#retained.set(id, { id, kind, bytes, locallyAdmitted: false });
		this.#sendQueue.push(id);
		trace(`protocol:retained-${kind}-committed`);
		this.#pump();
	}

	#pump(): void {
		if (
			this.#connection === undefined ||
			this.#pendingSend !== undefined ||
			this.#sendQueue.length === 0 ||
			this.#forced
		) {
			return;
		}
		const frameId = this.#sendQueue.shift();
		assert(frameId !== undefined, "Ready frame must exist.");
		const frame = this.#retained.get(frameId);
		if (frame === undefined) {
			this.#pump();
			return;
		}
		const connection = this.#connection;
		const generation = this.#bindingGeneration;
		const attemptEnvelope = frame.bytes.slice();
		this.#pendingSend = { frameId, generation };
		trace("protocol:state-committed-before-transport-effect");
		void connection.send(attemptEnvelope).then(
			() => {
				if (
					this.#pendingSend?.frameId !== frameId ||
					this.#pendingSend.generation !== generation
				) {
					return;
				}
				this.#pendingSend = undefined;
				frame.locallyAdmitted = true;
				trace("protocol:transport-admission-not-evidence-retirement");
				this.#pump();
			},
			(error: unknown) => {
				if (
					this.#pendingSend?.frameId !== frameId ||
					this.#pendingSend.generation !== generation
				) {
					return;
				}
				this.#pendingSend = undefined;
				this.#sendQueue.unshift(frameId);
				this.loseConnection(
					connection,
					error instanceof Error ? error : new Error(String(error)),
				);
			},
		);
	}

	#checkDrained(): void {
		if (
			this.#draining &&
			this.#pendingOutgoing.size === 0 &&
			this.#outgoing.size === 0 &&
			this.#incoming.size === 0 &&
			this.#retained.size === 0 &&
			this.#pendingSend === undefined
		) {
			this.#drain.resolve(undefined);
		}
	}
}

class MinimalOutgoingStream implements IRpcProtocolStream {
	readonly #session: MinimalProtocolSession;
	readonly #state: OutgoingStreamState;

	public constructor(
		session: MinimalProtocolSession,
		state: OutgoingStreamState,
	) {
		this.#session = session;
		this.#state = state;
	}

	public start(): void {
		this.#session.startOutgoing(this.#state);
	}

	public cancel(): void {
		this.#session.cancelOutgoing(this.#state);
	}
}

class MinimalRoleRuntime
	implements IRpcProtocolConnectorRuntime, IRpcProtocolAcceptorRuntime
{
	readonly #role: "connector" | "acceptor";
	readonly #host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost;
	#session: MinimalProtocolSession | undefined;
	#sessionHost: IRpcProtocolSessionHost | undefined;
	#connection: IRpcConnection | undefined;
	#subscription: { unsubscribe(): void } | undefined;
	#shutdownTask: Promise<void> | undefined;
	#cleanupTask: Promise<void> | undefined;
	#closed = false;

	public constructor(
		role: "connector" | "acceptor",
		host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
	) {
		this.#role = role;
		this.#host = host;
	}

	public get debugSession(): MinimalProtocolSession {
		assert(this.#session !== undefined, "Protocol Session is not installed.");
		return this.#session;
	}

	public bind(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (this.#role !== "connector") {
			return Promise.reject(new Error("Only Connector runtime may bind."));
		}
		return this.#adopt(connection, signal);
	}

	public accept(
		connection: IRpcConnection,
		signal: AbortSignal,
	): Promise<void> {
		if (this.#role !== "acceptor") {
			return Promise.reject(new Error("Only Acceptor runtime may accept."));
		}
		return this.#adopt(connection, signal);
	}

	public shutdown(): Promise<void> {
		this.#shutdownTask ??= this.#shutdown();
		return this.#shutdownTask;
	}

	public close(): void {
		if (this.#closed) {
			return;
		}
		this.#closed = true;
		this.#session?.forceClose();
		void this.#connection?.close();
	}

	public cleanup(): Promise<void> {
		this.#cleanupTask ??= Promise.resolve();
		return this.#cleanupTask;
	}

	public enterRecovery(error?: Error): void {
		if (this.#closed) {
			return;
		}
		this.#sessionHost?.transition(
			error === undefined
				? { type: "recovering" }
				: { type: "recovering", cause: error },
		);
	}

	async #adopt(connection: IRpcConnection, signal: AbortSignal): Promise<void> {
		if (signal.aborted) {
			await connection.close();
			throw new DOMException("Binding aborted.", "AbortError");
		}
		const provisional: Uint8Array[] = [];
		let active = false;
		const subscription = connection.message$.subscribe({
			next: (message) => {
				if (active) {
					this.#session?.receive(message);
				} else {
					assert(provisional.length < 4, "Provisional ingress is bounded.");
					provisional.push(message.slice());
				}
			},
			error: (error: unknown) => {
				this.#session?.loseConnection(
					connection,
					error instanceof Error ? error : new Error(String(error)),
				);
			},
			complete: () => this.#session?.loseConnection(connection),
		});
		await Promise.resolve();
		if (this.#closed || signal.aborted) {
			subscription.unsubscribe();
			await connection.close();
			throw new DOMException("Binding aborted.", "AbortError");
		}
		if (this.#session === undefined) {
			const session = new MinimalProtocolSession(this, this.#host);
			const sessionHost =
				this.#role === "connector"
					? (this.#host as IRpcProtocolConnectorHost).attachSession(session)
					: (this.#host as IRpcProtocolAcceptorHost).admitSession(session);
			assert(
				sessionHost !== undefined,
				"Framework rejected prototype Session.",
			);
			session.attachHost(sessionHost);
			this.#session = session;
			this.#sessionHost = sessionHost;
		} else {
			this.#sessionHost?.transition({ type: "recovered" });
		}
		this.#subscription?.unsubscribe();
		this.#subscription = subscription;
		this.#connection = connection;
		this.#session.installConnection(connection);
		active = true;
		for (const message of provisional) {
			this.#session.receive(message);
		}
	}

	async #shutdown(): Promise<void> {
		await (this.#session?.beginShutdown() ?? Promise.resolve());
		await this.#connection?.close();
	}
}

export const minimalCustomProtocolAdapter: IRpcProtocol = Object.freeze({
	createConnector: (host: IRpcProtocolConnectorHost) =>
		new MinimalRoleRuntime("connector", host),
	createAcceptor: (host: IRpcProtocolAcceptorHost) =>
		new MinimalRoleRuntime("acceptor", host),
});

type SourcePlan = {
	readonly values: readonly unknown[];
	readonly complete: boolean;
	readonly teardownThrows?: true;
	readonly lateValues?: readonly unknown[];
	readonly lateTerminal?: true;
	readonly teardownReentrantValue?: unknown;
};

class PrototypeFrameworkHost
	implements IRpcProtocolConnectorHost, IRpcProtocolAcceptorHost
{
	readonly #plans: SourcePlan[] = [];
	readonly #reservations = new Set<IRpcRetainedBytesReservation>();
	#session: IRpcProtocolSession | undefined;

	public readonly policy = PROTOTYPE_POLICY;
	public readonly transitions: RpcProtocolSessionTransition[] = [];
	public sourceSubscribeCount = 0;
	public sourceTeardownCount = 0;
	public sourceTeardownIncidentCount = 0;
	public activeSourceSlots = 0;
	public incomingRouteLookupCount = 0;

	public get session(): IRpcProtocolSession {
		assert(this.#session !== undefined, "Framework has no Session.");
		return this.#session;
	}

	public enqueueSourcePlan(plan: SourcePlan): void {
		this.#plans.push(plan);
	}

	public reserveRetainedBytes(
		_bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		let released = false;
		const reservation = {
			release: () => {
				if (!released) {
					released = true;
					this.#reservations.delete(reservation);
				}
			},
		};
		this.#reservations.add(reservation);
		return reservation;
	}

	public normalizeApplicationValue(value: unknown): IRpcApplicationSnapshot {
		trace("framework:normalize-application-value");
		if (!isApplicationValue(value)) {
			throw new TypeError(
				"Value is outside the prototype Application profile.",
			);
		}
		return createSnapshot(value);
	}

	public normalizeApplicationArguments(
		value: unknown,
	): IRpcApplicationArgumentsSnapshot {
		if (!Array.isArray(value) || !value.every(isApplicationValue)) {
			throw new TypeError("Arguments are outside the Application profile.");
		}
		return createSnapshot(value) as IRpcApplicationArgumentsSnapshot;
	}

	public applicationValuesEqual(
		left: IRpcApplicationSnapshot,
		right: IRpcApplicationSnapshot,
	): boolean {
		return JSON.stringify(left.value) === JSON.stringify(right.value);
	}

	public fault(_reason: RpcProtocolFaultReason, error: Error): void {
		throw error;
	}

	public attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		return this.#attach(session);
	}

	public admitSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		return this.#attach(session);
	}

	#attach(session: IRpcProtocolSession): IRpcProtocolSessionHost {
		this.#session = session;
		return {
			reserveIncomingCall: () => undefined,
			reserveIncomingStream: (request) => this.#reserveIncomingStream(request),
			transition: (transition) => {
				this.transitions.push(transition);
				trace(`framework:transition-${transition.type}`);
			},
			fault: (_reason, error) => {
				session.forceClose();
				throw error;
			},
		};
	}

	#reserveIncomingStream(
		request: RpcProtocolStreamRequest,
	): RpcProtocolIncomingStreamReservation | undefined {
		this.incomingRouteLookupCount += 1;
		if (request.service !== "demo.streams.v1") {
			return {
				kind: "unknown",
				code: "unknown-service",
				reservation: new PrototypeUnknownStreamReservation(),
			};
		}
		if (request.member !== "values" && request.member !== "values$") {
			return {
				kind: "unknown",
				code: "unknown-member",
				reservation: new PrototypeUnknownStreamReservation(),
			};
		}
		const plan = this.#plans.shift() ?? { values: [], complete: false };
		return {
			kind: "source",
			reservation: new PrototypeIncomingSourceReservation(this, plan),
		};
	}
}

class PrototypeUnknownStreamReservation
	implements IRpcProtocolIncomingUnknownStreamReservation
{
	#open = true;

	public commit(): IRpcProtocolIncomingStream {
		assert(this.#open, "Unknown reservation must have one winner.");
		this.#open = false;
		return { finish: (_outcome, onReleased) => onReleased() };
	}

	public release(): void {
		assert(this.#open, "Unknown reservation must have one winner.");
		this.#open = false;
	}
}

class PrototypeIncomingSourceReservation
	implements IRpcProtocolIncomingSourceReservation
{
	readonly #host: PrototypeFrameworkHost;
	readonly #plan: SourcePlan;
	#open = true;

	public constructor(host: PrototypeFrameworkHost, plan: SourcePlan) {
		this.#host = host;
		this.#plan = plan;
	}

	public commit(source: IRpcProtocolSourceSink): IRpcProtocolIncomingStream {
		assert(this.#open, "Source reservation must have one winner.");
		this.#open = false;
		const stream = new PrototypeIncomingSource(this.#host, source, this.#plan);
		trace("framework:source-job-published");
		queueMicrotask(() => stream.start());
		return stream;
	}

	public release(): void {
		assert(this.#open, "Source reservation must have one winner.");
		this.#open = false;
	}
}

class PrototypeIncomingSource implements IRpcProtocolIncomingStream {
	readonly #host: PrototypeFrameworkHost;
	readonly #source: IRpcProtocolSourceSink;
	readonly #plan: SourcePlan;
	#starting = false;
	#started = false;
	#finishRequested = false;
	#released = false;
	#onReleased: (() => void) | undefined;

	public constructor(
		host: PrototypeFrameworkHost,
		source: IRpcProtocolSourceSink,
		plan: SourcePlan,
	) {
		this.#host = host;
		this.#source = source;
		this.#plan = plan;
	}

	public start(): void {
		if (this.#started || this.#finishRequested) {
			return;
		}
		this.#started = true;
		this.#starting = true;
		this.#host.activeSourceSlots += 1;
		this.#host.sourceSubscribeCount += 1;
		trace("framework:source-subscribe-begun");
		for (const raw of this.#plan.values) {
			const emission = this.#source.reserveEmission();
			if (emission === undefined) {
				break;
			}
			try {
				emission.commit(this.#host.normalizeApplicationValue(raw));
			} catch {
				emission.fail();
			}
		}
		if (this.#plan.complete && !this.#finishRequested) {
			this.#source.finish({ type: "completed" });
		}
		for (const raw of this.#plan.lateValues ?? []) {
			const emission = this.#source.reserveEmission();
			if (emission !== undefined) {
				emission.commit(this.#host.normalizeApplicationValue(raw));
			}
		}
		if (this.#plan.lateTerminal) {
			this.#source.finish({ type: "failed", code: "handler-failed" });
		}
		this.#starting = false;
		trace("framework:source-subscribe-returned");
		if (this.#finishRequested) {
			this.#release();
		}
	}

	public finish(
		_outcome: RpcIncomingStreamTerminal,
		onReleased: () => void,
	): void {
		if (this.#finishRequested) {
			return;
		}
		this.#finishRequested = true;
		this.#onReleased = onReleased;
		trace("framework:source-fenced-teardown-requested");
		if (!this.#starting) {
			this.#release();
		}
	}

	#release(): void {
		if (this.#released) {
			return;
		}
		this.#released = true;
		this.#host.sourceTeardownCount += 1;
		try {
			if (this.#plan.teardownThrows) {
				throw new Error("Prototype source teardown failure.");
			}
		} catch {
			this.#host.sourceTeardownIncidentCount += 1;
		}
		this.#host.activeSourceSlots -= 1;
		trace("framework:source-teardown-settled");
		if (this.#plan.teardownReentrantValue !== undefined) {
			trace("framework:late-source-callback-after-fence");
			assert(
				this.#source.reserveEmission() === undefined,
				"A teardown-reentrant callback must be fenced before normalization.",
			);
		}
		const onReleased = this.#onReleased;
		this.#onReleased = undefined;
		assert(
			onReleased !== undefined,
			"Source release completion must be armed.",
		);
		onReleased();
	}
}

function createSnapshot<T extends RpcApplicationValue>(
	value: T,
): IRpcApplicationSnapshot<T> {
	const copy = structuredClone(value);
	return Object.freeze({
		value: copy,
		weight: encoder.encode(JSON.stringify(copy)).byteLength,
	}) as IRpcApplicationSnapshot<T>;
}

function isApplicationValue(value: unknown): value is RpcApplicationValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "string"
	) {
		return true;
	}
	if (typeof value === "number") {
		return Number.isFinite(value);
	}
	if (Array.isArray(value)) {
		return value.every(isApplicationValue);
	}
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return (
		(prototype === Object.prototype || prototype === null) &&
		Object.values(value).every(isApplicationValue)
	);
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function assertBefore(first: string, second: string): void {
	const firstIndex = TRACE.indexOf(first);
	const secondIndex = TRACE.indexOf(second);
	assert(firstIndex >= 0, `Missing trace: ${first}`);
	assert(secondIndex >= 0, `Missing trace: ${second}`);
	assert(firstIndex < secondIndex, `${first} must precede ${second}.`);
}

function assertLastBefore(first: string, second: string): void {
	const firstIndex = TRACE.lastIndexOf(first);
	const secondIndex = TRACE.lastIndexOf(second);
	assert(firstIndex >= 0, `Missing trace: ${first}`);
	assert(secondIndex >= 0, `Missing trace: ${second}`);
	assert(firstIndex < secondIndex, `${first} must precede ${second}.`);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	return (
		left.byteLength === right.byteLength &&
		left.every((value, index) => value === right[index])
	);
}

async function flushMicrotasks(rounds = 12): Promise<void> {
	for (let index = 0; index < rounds; index += 1) {
		await Promise.resolve();
	}
}

export async function runStreamingProtocolSpiPrototype(): Promise<void> {
	TRACE.length = 0;
	const host = new PrototypeFrameworkHost();
	const runtime = minimalCustomProtocolAdapter.createConnector(
		host,
	) as MinimalRoleRuntime;
	const firstConnection = new InstrumentedCompleteMessageConnection();
	await runtime.bind(firstConnection, new AbortController().signal);
	const session = runtime.debugSession;
	assert(
		host.session === session,
		"Framework and Protocol must share one Session handle.",
	);
	assert(
		firstConnection.sendCalls === 0 && host.sourceSubscribeCount === 0,
		"Creating a peer without a stream subscribe must create no stream work.",
	);

	const delivered: RpcApplicationValue[] = [];
	const outgoingOutcomes: RpcStreamOutcome[] = [];
	let observationOpen = true;
	let unsubscribeOnNext = false;
	let outgoing: IRpcProtocolStream | undefined;
	const subscriberSink: IRpcProtocolSubscriberSink = {
		reserveItem: (snapshot) => {
			const frozenValue = snapshot.value;
			const shouldProject = observationOpen;
			return {
				commit: () => {
					if (!shouldProject) {
						return "closed";
					}
					trace("framework:observer-next-effect");
					delivered.push(frozenValue);
					if (unsubscribeOnNext) {
						observationOpen = false;
						outgoing?.cancel();
						trace("framework:observer-unsubscribed-inside-next");
						return "closed";
					}
					return "rearm";
				},
			};
		},
		reserveTerminal: (outcome) => {
			const frozenOutcome = outcome;
			const shouldProject = observationOpen;
			observationOpen = false;
			return {
				commit: () => {
					if (shouldProject) {
						trace("framework:subscriber-finish-effect");
						outgoingOutcomes.push(frozenOutcome);
					}
				},
			};
		},
	};
	const methodRequest: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values",
		kind: "stream-method",
		args: host.normalizeApplicationArguments([]),
	};
	const retractedReservation = session.reserveStream(methodRequest);
	assert(
		retractedReservation !== undefined,
		"Expected identity-free Pending reservation.",
	);
	const retracted = retractedReservation.commit(subscriberSink);
	retracted.cancel();
	assert(
		firstConnection.sendCalls === 0 &&
			delivered.length === 0 &&
			outgoingOutcomes.length === 0,
		"Pre-Outgoing unsubscribe must preserve Definite Non-Execution.",
	);
	const reserved = session.reserveStream(methodRequest);
	assert(reserved !== undefined, "Expected Local Stream reservation.");
	outgoing = reserved.commit(subscriberSink);
	assert(
		firstConnection.sendCalls === 0,
		"Commit must not call Transport send.",
	);
	outgoing.start();
	assert(
		Number(firstConnection.sendCalls) === 1,
		"start() alone begins Outgoing Admission.",
	);
	assert(
		firstConnection.maxUnsettledSends === 1,
		"Protocol must keep one unsettled Transport send.",
	);

	const borrowed = firstConnection.borrowedMessage;
	assert(
		borrowed !== undefined,
		"Blocked Adapter must borrow the current envelope.",
	);
	const borrowedSnapshot = borrowed.slice();
	firstConnection.emitInbound(encoder.encode("peer|item|1|1|hello"));
	assert(
		Number(delivered.length) === 1 && delivered[0] === "hello",
		"Item must deliver once.",
	);
	assertBefore(
		"framework:subscriber-item-projection-reserved",
		"protocol:subscriber-disposition-committed",
	);
	assertBefore(
		"protocol:subscriber-disposition-committed",
		"protocol:subscriber-receipt-committed",
	);
	assertBefore(
		"protocol:subscriber-receipt-committed",
		"framework:observer-next-effect",
	);
	assertBefore(
		"framework:observer-next-effect",
		"protocol:credit-rearmed-after-effect",
	);
	assert(
		Number(firstConnection.sendCalls) === 1,
		"Blocked send keeps later Protocol evidence out of the Adapter queue.",
	);
	session.updateReverseReceipt(7);
	assert(
		session.reverseReceipt === 7 && bytesEqual(borrowed, borrowedSnapshot),
		"Reverse receipt changes must not mutate bytes borrowed by Transport.",
	);

	const routesBeforeUnknown = host.incomingRouteLookupCount;
	session.admitIncomingStream(6, {
		service: "demo.streams.v1",
		member: "missing",
		kind: "stream-property",
	});
	assert(
		host.incomingRouteLookupCount === routesBeforeUnknown + 1 &&
			host.sourceSubscribeCount === 0 &&
			session.retainedFrameCount > 0,
		"Unknown member must retain semantic rejection without source work.",
	);

	host.enqueueSourcePlan({
		values: ["first", "second"],
		complete: true,
		teardownThrows: true,
		lateValues: ["late"],
		lateTerminal: true,
	});
	session.admitIncomingStream(7, methodRequest);
	await flushMicrotasks();
	assert(
		Number(host.sourceSubscribeCount) === 1,
		"Remote Admission must create one Source Subscription attempt.",
	);
	assert(
		TRACE.includes("protocol:remote-stream-admission-committed:stream-method"),
		"A stream method must use the shared incoming lifecycle seam.",
	);
	assert(
		TRACE.filter((entry) => entry === "framework:normalize-application-value")
			.length === 2,
		"Only the peer item and first credit-backed Source Emission are normalized.",
	);
	assertLastBefore(
		"protocol:source-emission-reserved",
		"framework:normalize-application-value",
	);
	assertBefore(
		"protocol:source-terminal-committed:overflow",
		"framework:source-fenced-teardown-requested",
	);
	assertBefore(
		"framework:source-subscribe-returned",
		"framework:source-teardown-settled",
	);
	assertBefore(
		"framework:source-teardown-settled",
		"protocol:source-release-completion-observed",
	);
	assert(
		host.sourceTeardownCount === 1 &&
			host.sourceTeardownIncidentCount === 1 &&
			host.activeSourceSlots === 0 &&
			session.activeSourceCount === 0,
		"Overflow must fence once, settle teardown once, and release both owners.",
	);
	assert(
		session.ordinaryItemHeadroom === 0 &&
			session.protectedTerminalRetentions > 0 &&
			TRACE.includes("protocol:source-terminal-boundary:1") &&
			TRACE.filter(
				(entry) => entry === "protocol:source-terminal-committed:overflow",
			).length === 1 &&
			!TRACE.includes("protocol:source-terminal-committed:handler-failed"),
		"W=1 must keep boundary 1, one terminal winner, and protected terminal headroom.",
	);
	const retainedKinds = TRACE.filter((entry) =>
		entry.startsWith("protocol:retained-"),
	);
	assert(
		retainedKinds.indexOf("protocol:retained-item-committed") <
			retainedKinds.lastIndexOf("protocol:retained-terminal-committed"),
		"The admitted item must remain ordered before overflow terminal.",
	);

	const sessionIdentity = runtime.debugSession;
	firstConnection.fail(new Error("Injected Transport failure."));
	await flushMicrotasks();
	assert(
		host.transitions.some((transition) => transition.type === "recovering"),
		"Transport failure must enter Recovery.",
	);
	assert(
		!outgoingOutcomes.some(
			(outcome) => outcome.type === "failed" && outcome.code === "overflow",
		),
		"Transport failure must not be relabeled Stream Overflow.",
	);
	assert(
		session.retainedFrameCount > 0,
		"Protocol evidence must survive binding loss.",
	);

	const replacement = new InstrumentedCompleteMessageConnection();
	replacement.unblock();
	await runtime.bind(replacement, new AbortController().signal);
	await flushMicrotasks(40);
	assert(
		runtime.debugSession === sessionIdentity,
		"Recovery must retain Session identity.",
	);
	assert(
		Number(host.sourceSubscribeCount) === 1,
		"Recovery must not acquire or subscribe the source again.",
	);
	assert(
		host.transitions.some((transition) => transition.type === "recovered"),
		"Replacement binding must project recovered.",
	);
	assert(
		replacement.maxUnsettledSends === 1 &&
			replacement.admittedMessages.every((message) =>
				decoder.decode(message).startsWith("custom-v1|"),
			),
		"Replacement replay must use unchanged complete byte messages and one send slot.",
	);
	assert(
		Number(delivered.length) === 1 &&
			TRACE.filter((entry) => entry === "protocol:outgoing-stream-admitted")
				.length === 1,
		"Recovery must retain the same Stream and must not repeat Observer delivery.",
	);
	const creditRearmsBeforeUnsubscribe = TRACE.filter(
		(entry) => entry === "protocol:credit-rearmed-after-effect",
	).length;
	unsubscribeOnNext = true;
	replacement.emitInbound(encoder.encode("peer|item|1|2|stop"));
	assert(
		delivered.at(-1) === "stop" &&
			TRACE.filter((entry) => entry === "protocol:credit-rearmed-after-effect")
				.length === creditRearmsBeforeUnsubscribe,
		"An unsubscribe inside next() must not replenish credit.",
	);
	session.acknowledgeAllRetainedFrames();
	replacement.emitInbound(encoder.encode("peer|terminal|1|2|completed"));
	assert(
		outgoingOutcomes.length === 0,
		"Local unsubscribe must suppress Observer terminal without claiming remote stop.",
	);

	host.enqueueSourcePlan({
		values: [],
		complete: false,
		teardownReentrantValue: "late-after-force",
	});
	const propertyRequest: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values$",
		kind: "stream-property",
	};
	session.admitIncomingStream(8, propertyRequest);
	await flushMicrotasks();
	assert(
		Number(host.activeSourceSlots) === 1,
		"Silent source must remain active.",
	);
	assert(
		TRACE.includes(
			"protocol:remote-stream-admission-committed:stream-property",
		),
		"A stream property must use the same incoming lifecycle seam.",
	);
	const routesBeforeShortage = host.incomingRouteLookupCount;
	session.admitIncomingStream(9, propertyRequest);
	assert(
		host.incomingRouteLookupCount === routesBeforeShortage &&
			TRACE.includes("protocol:remote-resource-rejection-before-route"),
		"Active Stream shortage must reject before route lookup.",
	);
	let shutdownSettled = false;
	const shutdown = runtime.shutdown().then(() => {
		shutdownSettled = true;
	});
	await flushMicrotasks();
	assert(!shutdownSettled, "Graceful shutdown must wait for an active source.");
	assert(
		session.reserveStream(propertyRequest) === undefined,
		"Graceful cutoff must reject new stream roots.",
	);
	runtime.close();
	await shutdown;
	assert(
		Number(host.sourceTeardownCount) === 2 && host.activeSourceSlots === 0,
		"Force must fence then release the remaining Source Subscription.",
	);
	assert(
		TRACE.includes("framework:late-source-callback-after-fence"),
		"A callback re-entering after force must be fenced before normalization.",
	);
	const cleanup = runtime.cleanup();
	assert(
		cleanup === runtime.cleanup(),
		"Protocol cleanup task must be cached.",
	);
	await cleanup;

	const overCreditHost = new PrototypeFrameworkHost();
	const overCreditRuntime = minimalCustomProtocolAdapter.createConnector(
		overCreditHost,
	) as MinimalRoleRuntime;
	const overCreditConnection = new InstrumentedCompleteMessageConnection();
	await overCreditRuntime.bind(
		overCreditConnection,
		new AbortController().signal,
	);
	const overCreditSession = overCreditRuntime.debugSession;
	const overCreditReservation = overCreditSession.reserveStream(methodRequest);
	assert(
		overCreditReservation !== undefined,
		"Expected an isolated over-credit Stream reservation.",
	);
	let overCreditStream: IRpcProtocolStream | undefined;
	let overCreditObserverCalls = 0;
	overCreditStream = overCreditReservation.commit({
		reserveItem: () => ({
			commit: () => {
				overCreditObserverCalls += 1;
				overCreditStream?.cancel();
				return "closed";
			},
		}),
		reserveTerminal: () => ({ commit: () => undefined }),
	});
	overCreditStream.start();
	overCreditConnection.emitInbound(
		encoder.encode("peer|item|1|1|credit-backed"),
	);
	let inboundOverCreditRejected = false;
	try {
		overCreditConnection.emitInbound(
			encoder.encode("peer|item|1|2|over-credit"),
		);
	} catch {
		inboundOverCreditRejected = true;
	}
	assert(
		inboundOverCreditRejected && overCreditObserverCalls === 1,
		"Inbound over-credit must fault before a second Observer projection.",
	);
	overCreditRuntime.close();
	await overCreditRuntime.cleanup();

	console.log(
		JSON.stringify({
			status: "passed",
			transportSurface: ["message$", "send", "close"],
			maxUnsettledSends: Math.max(
				firstConnection.maxUnsettledSends,
				replacement.maxUnsettledSends,
			),
			delivered,
			sourceSubscriptions: host.sourceSubscribeCount,
			sourceTeardowns: host.sourceTeardownCount,
			recoveryPreservedSession: runtime.debugSession === sessionIdentity,
			inboundOverCreditRejected,
		}),
	);
}

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <
		Value,
	>() => Value extends Right ? 1 : 2
		? true
		: false;
type Expect<Value extends true> = Value;

type TransportKeysStayExact = Expect<
	Equal<keyof IRpcConnection, "message$" | "send" | "close">
>;
type SourcePortKeysStayMinimal = Expect<
	Equal<keyof IRpcProtocolSourceSink, "reserveEmission" | "finish">
>;
type SubscriberPortKeysStayMinimal = Expect<
	Equal<keyof IRpcProtocolSubscriberSink, "reserveItem" | "reserveTerminal">
>;
void (0 as unknown as TransportKeysStayExact);
void (0 as unknown as SourcePortKeysStayMinimal);
void (0 as unknown as SubscriberPortKeysStayMinimal);

declare const argumentsSnapshot: IRpcApplicationArgumentsSnapshot;
declare const connection: IRpcConnection;
declare const emission: IRpcProtocolSourceEmissionReservation;
declare const incomingSourceReservation: IRpcProtocolIncomingSourceReservation;
declare const rawObservable: Observable<RpcApplicationValue>;
declare const source: IRpcProtocolSourceSink;
declare const stream: IRpcProtocolStream;

/** Compiled only; deliberate negative cases prove forbidden surface. */
export function streamingProtocolTypeProbes(): void {
	const method: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values",
		kind: "stream-method",
		args: argumentsSnapshot,
	};
	const property: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values$",
		kind: "stream-property",
	};
	void method;
	void property;

	const propertyWithArgs: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values$",
		kind: "stream-property",
		// @ts-expect-error A stream property has no argument snapshot.
		args: argumentsSnapshot,
	};
	void propertyWithArgs;

	const requestWithWireIdentity: RpcProtocolStreamRequest = {
		service: "demo.streams.v1",
		member: "values",
		kind: "stream-method",
		args: argumentsSnapshot,
		// @ts-expect-error Sequence/ACK identity is Protocol-private.
		seq: 1,
	};
	void requestWithWireIdentity;

	// @ts-expect-error Only Framework can create opaque normalized snapshots.
	emission.commit({ value: "raw", weight: 3 });
	// @ts-expect-error A raw Application Value is not a normalized snapshot.
	emission.commit("raw");
	// @ts-expect-error A raw application Observable never crosses the Protocol seam.
	incomingSourceReservation.commit(rawObservable);
	// @ts-expect-error Raw Error never crosses the Source terminal port.
	source.finish({ type: "failed", code: "handler-failed", error: new Error() });
	// @ts-expect-error Subscriber-side cancellation is not a Source terminal input.
	source.finish({ type: "canceled" });
	// @ts-expect-error Application Stream cancellation does not accept AbortSignal.
	stream.start(new AbortController().signal);
	// @ts-expect-error Caller-facing request(n) is deliberately absent.
	stream.request(1);
	// @ts-expect-error Credit horizon is Protocol-private.
	void stream.creditHorizon;
	// @ts-expect-error Transport has no stream-aware send member.
	connection.sendStream({ kind: "item" });
	// @ts-expect-error Transport exposes no capacity getter.
	void connection.capacity;
	// @ts-expect-error Transport exposes no pause/resume flow-control API.
	connection.pause();
}

await runStreamingProtocolSpiPrototype();
