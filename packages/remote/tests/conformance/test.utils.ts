/**
 * @overview Deterministic in-memory candidates for conformance runner self-tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { deserialize, serialize } from "node:v8";
import { Subject } from "rxjs";

import type {
	IRpcAcceptorAdapterConformanceFixture,
	IRpcAdapterConformanceRemote,
	IRpcConnectorAdapterConformanceFixture,
	IRpcProtocolConformanceFixture,
} from "../../src/conformance";
import { RpcCloseReasonEnum, RpcExceptionCodeEnum } from "../../src/index";
import type {
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolIncomingStream,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcProtocolSourceSink,
	IRpcProtocolStreamReservation,
	IRpcProtocolSubscriberSink,
	RpcApplicationValue,
	RpcCallFailure,
	RpcHandlerOutcome,
	RpcIncomingStreamTerminal,
	RpcProtocolStreamRequest,
	RpcStreamFailure,
	RpcStreamOutcome,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "../../src/interfaces/rpc-adapter.interface";
import type { IRpcConnection } from "../../src/interfaces/rpc-connection.interface";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";

interface PendingSend {
	readonly message: Uint8Array;
	readonly deferred: PromiseWithResolvers<void>;
}

interface ConnectionPair {
	readonly connection: IRpcConnection;
	readonly remote: IRpcAdapterConformanceRemote;
}

type MemoryProtocolRecord =
	| { readonly kind: "hello" }
	| { readonly kind: "welcome" }
	| {
			readonly kind: "call";
			readonly id: number;
			readonly service: string;
			readonly method: string;
			readonly args: readonly RpcApplicationValue[];
	  }
	| { readonly kind: "cancel"; readonly id: number }
	| {
			readonly kind: "result";
			readonly id: number;
			readonly outcome: "void" | "returned" | "failed";
			readonly value?: RpcApplicationValue;
			readonly code?: RpcCallFailure;
	  }
	| {
			readonly kind: "stream-start";
			readonly id: number;
			readonly service: string;
			readonly member: string;
			readonly streamKind: "stream-method" | "stream-property";
			readonly args?: readonly RpcApplicationValue[];
	  }
	| {
			readonly kind: "stream-item";
			readonly id: number;
			readonly ordinal: number;
			readonly value: RpcApplicationValue;
	  }
	| {
			readonly kind: "stream-credit";
			readonly id: number;
			readonly through: number;
	  }
	| { readonly kind: "stream-cancel"; readonly id: number }
	| {
			readonly kind: "stream-terminal";
			readonly id: number;
			readonly itemThrough: number;
			readonly outcome: "completed" | "canceled" | "failed";
			readonly code?: RpcStreamFailure;
	  }
	| { readonly kind: "stream-terminal-ack"; readonly id: number }
	| { readonly kind: "fault" }
	| { readonly kind: "close" };

interface MemoryOutgoingStream {
	readonly sink: IRpcProtocolSubscriberSink;
	receivedItems: number;
	creditThrough: number;
	closed: boolean;
}

interface MemoryIncomingStream {
	readonly request: RpcProtocolStreamRequest;
	readonly source: IRpcProtocolSourceSink;
	readonly control: IRpcProtocolIncomingStream;
	itemThrough: number;
	creditThrough: number;
	closed: boolean;
	released: boolean;
}

export type MemoryProtocolMutant =
	| "accept-over-credit"
	| "terminal-before-item"
	| "reacquire-on-recovery"
	| "terminal-ack-over-retirement"
	| "adapter-rejection-overflow";

export function createMemoryProtocolFixture(
	mutant?: MemoryProtocolMutant,
): IRpcProtocolConformanceFixture {
	return {
		protocol: createMemoryProtocol(false, mutant),
		counterExhaustionProtocol: createMemoryProtocol(true, mutant),
		createActiveProtocolFaultMessage: () =>
			encodeMemoryRecord({ kind: "fault" }),
	};
}

function createMemoryProtocol(
	counterExhaustion: boolean,
	mutant?: MemoryProtocolMutant,
): IRpcProtocol {
	return Object.freeze({
		createConnector: (host: IRpcProtocolConnectorHost) =>
			new MemoryProtocolRuntime("connector", host, counterExhaustion, mutant),
		createAcceptor: (host: IRpcProtocolAcceptorHost) =>
			new MemoryProtocolRuntime("acceptor", host, counterExhaustion, mutant),
	});
}

class MemoryProtocolRuntime
	implements IRpcProtocolConnectorRuntime, IRpcProtocolAcceptorRuntime
{
	readonly #role: "connector" | "acceptor";
	readonly #host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost;
	readonly #counterExhaustion: boolean;
	readonly #mutant: MemoryProtocolMutant | undefined;
	readonly #binding = Promise.withResolvers<void>();
	readonly #outgoing = new Map<number, IRpcProtocolInvocationSink>();
	readonly #outgoingStreams = new Map<number, MemoryOutgoingStream>();
	readonly #incomingStreams = new Map<number, MemoryIncomingStream>();
	readonly #pendingTerminalAcks = new Set<number>();
	readonly #incoming = new Map<
		number,
		{
			finish(outcome: {
				readonly type: RpcCallTerminalTypeEnum.failed;
				readonly code: RpcExceptionCodeEnum.canceled;
			}): void;
		}
	>();
	#connection: IRpcConnection | undefined;
	#session: MemoryProtocolSession | undefined;
	#sessionHost: IRpcProtocolSessionHost | undefined;
	#nextCallId = 1;
	#nextStreamId = 1;
	#closing = false;
	#draining = false;
	#cleanupTask: Promise<void> | undefined;
	#shutdown: PromiseWithResolvers<void> | undefined;
	#sendTail = Promise.resolve();

	public constructor(
		role: "connector" | "acceptor",
		host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
		counterExhaustion: boolean,
		mutant?: MemoryProtocolMutant,
	) {
		this.#role = role;
		this.#host = host;
		this.#counterExhaustion = counterExhaustion;
		this.#mutant = mutant;
	}

	public bind(connection: IRpcConnection, _signal: AbortSignal): Promise<void> {
		if (this.#role !== "connector") {
			return Promise.reject(new Error("Only the Connector runtime can bind."));
		}
		this.#subscribe(connection);
		if (this.#session !== undefined) {
			this.#reacquireSourcesForMutant();
			this.#sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovered,
			});
			return Promise.resolve();
		}
		void Promise.resolve().then(() => this.#send({ kind: "hello" }));
		return this.#binding.promise;
	}

	public accept(
		connection: IRpcConnection,
		_signal: AbortSignal,
	): Promise<void> {
		if (this.#role !== "acceptor") {
			return Promise.reject(new Error("Only the Acceptor runtime can accept."));
		}
		this.#subscribe(connection);
		if (this.#session !== undefined) {
			this.#reacquireSourcesForMutant();
			this.#sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovered,
			});
			return Promise.resolve();
		}
		return this.#binding.promise;
	}

	public async shutdown(): Promise<void> {
		this.#draining = true;
		this.#shutdown ??= Promise.withResolvers<void>();
		this.#checkDrained();
		return this.#shutdown.promise;
	}

	public close(): void {
		this.#closing = true;
		for (const sink of this.#outgoing.values()) {
			sink.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
		}
		this.#outgoing.clear();
		for (const stream of this.#outgoingStreams.values()) {
			if (stream.closed) {
				continue;
			}
			stream.closed = true;
			stream.sink
				.reserveTerminal({
					type: "failed",
					code: RpcExceptionCodeEnum.outcomeUnknown,
				})
				.commit();
		}
		this.#outgoingStreams.clear();
		this.#pendingTerminalAcks.clear();
		for (const stream of this.#incomingStreams.values()) {
			this.#finishIncomingStream(stream, { type: "session-terminated" });
		}
		void this.#connection?.close();
		this.#shutdown?.resolve(undefined);
	}

	public cleanup(): Promise<void> {
		this.#cleanupTask ??= Promise.resolve();
		return this.#cleanupTask;
	}

	public reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		if (this.#closing || this.#sessionHost === undefined) {
			return undefined;
		}
		if (this.#counterExhaustion && this.#nextCallId === 1) {
			this.#sessionHost.transition({
				type: RpcProtocolSessionTransitionTypeEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			});
			return undefined;
		}
		let settled = false;
		return {
			commit: (sink) => {
				if (settled) {
					throw new Error("Invocation reservation already settled.");
				}
				settled = true;
				const id = this.#nextCallId;
				this.#nextCallId += 1;
				return {
					start: () => {
						this.#outgoing.set(id, sink);
						this.#sendIgnoringFailure({
							kind: "call",
							id,
							service: request.service,
							method: request.method,
							args: request.args.value,
						});
					},
					cancel: () => this.#sendIgnoringFailure({ kind: "cancel", id }),
				};
			},
			release() {
				if (settled) {
					throw new Error("Invocation reservation already settled.");
				}
				settled = true;
			},
		};
	}

	public reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		if (this.#closing || this.#draining || this.#sessionHost === undefined) {
			return undefined;
		}
		let settled = false;
		return {
			commit: (sink) => {
				if (settled) {
					throw new Error("Stream reservation already settled.");
				}
				settled = true;
				const id = this.#nextStreamId;
				this.#nextStreamId += 1;
				let started = false;
				return {
					start: () => {
						if (started) {
							return;
						}
						started = true;
						this.#outgoingStreams.set(id, {
							sink,
							receivedItems: 0,
							creditThrough: 1,
							closed: false,
						});
						this.#sendIgnoringFailure({
							kind: "stream-start",
							id,
							service: request.service,
							member: request.member,
							streamKind: request.kind,
							...(request.kind === "stream-method"
								? { args: request.args.value }
								: {}),
						});
					},
					cancel: () => {
						if (!started) {
							return;
						}
						this.#sendIgnoringFailure({ kind: "stream-cancel", id });
					},
				};
			},
			release() {
				if (settled) {
					throw new Error("Stream reservation already settled.");
				}
				settled = true;
			},
		};
	}

	public forceSession(): void {
		this.close();
	}

	#subscribe(connection: IRpcConnection): void {
		this.#connection = connection;
		connection.message$.subscribe({
			next: (message) => {
				void this.#receive(message).catch((error: unknown) => {
					const cause =
						error instanceof Error ? error : new Error(String(error));
					if (this.#sessionHost === undefined) {
						this.#host.fault(RpcCloseReasonEnum.protocolFault, cause);
					} else {
						this.#sessionHost.fault(RpcCloseReasonEnum.protocolFault, cause);
					}
				});
			},
			error: (error: unknown) => {
				if (this.#closing) {
					return;
				}
				this.#connection = undefined;
				this.#sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.recovering,
					...(error instanceof Error ? { cause: error } : {}),
				});
			},
		});
	}

	async #receive(message: Uint8Array): Promise<void> {
		const record = decodeMemoryRecord(message);
		switch (record.kind) {
			case "hello":
				this.#installSession();
				await this.#send({ kind: "welcome" });
				this.#binding.resolve(undefined);
				break;
			case "welcome":
				this.#installSession();
				this.#binding.resolve(undefined);
				break;
			case "call":
				await this.#receiveCall(record);
				break;
			case "cancel": {
				const call = this.#incoming.get(record.id);
				call?.finish({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.canceled,
				});
				this.#incoming.delete(record.id);
				await this.#send({
					kind: "result",
					id: record.id,
					outcome: "failed",
					code: RpcExceptionCodeEnum.canceled,
				});
				break;
			}
			case "result":
				this.#receiveResult(record);
				break;
			case "stream-start":
				await this.#receiveStreamStart(record);
				break;
			case "stream-item":
				await this.#receiveStreamItem(record);
				break;
			case "stream-credit":
				this.#receiveStreamCredit(record);
				break;
			case "stream-cancel":
				this.#receiveStreamCancel(record.id);
				break;
			case "stream-terminal":
				this.#receiveStreamTerminal(record);
				break;
			case "stream-terminal-ack":
				this.#receiveStreamTerminalAck(record.id);
				break;
			case "fault":
				this.#sessionHost?.fault(
					RpcCloseReasonEnum.protocolFault,
					new Error("Active Protocol fault fixture."),
				);
				break;
			case "close":
				this.#sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason: RpcCloseReasonEnum.remoteTerminated,
				});
				this.#closing = true;
				await this.#connection?.close();
				break;
		}
	}

	#installSession(): void {
		if (this.#session !== undefined) {
			return;
		}
		const session = new MemoryProtocolSession(this);
		const sessionHost =
			this.#role === "connector"
				? (this.#host as IRpcProtocolConnectorHost).attachSession(session)
				: (this.#host as IRpcProtocolAcceptorHost).admitSession(session);
		if (sessionHost === undefined) {
			throw new Error("Session admission rejected.");
		}
		this.#session = session;
		this.#sessionHost = sessionHost;
	}

	async #receiveCall(
		record: Extract<MemoryProtocolRecord, { readonly kind: "call" }>,
	): Promise<void> {
		const args = this.#host.normalizeApplicationArguments(record.args);
		const reserved = this.#sessionHost?.reserveIncomingCall({
			service: record.service,
			method: record.method,
			args,
		});
		if (reserved === undefined) {
			await this.#send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			return;
		}
		if (reserved.kind === "unknown") {
			reserved.reservation.commit();
			await this.#send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: reserved.code,
			});
			return;
		}
		const call = reserved.reservation.commit();
		this.#incoming.set(record.id, call);
		const outcome = await call.handlerOutcome;
		this.#incoming.delete(record.id);
		await this.#send(handlerOutcomeRecord(record.id, outcome));
	}

	#receiveResult(
		record: Extract<MemoryProtocolRecord, { readonly kind: "result" }>,
	): void {
		const sink = this.#outgoing.get(record.id);
		if (sink === undefined) {
			return;
		}
		this.#outgoing.delete(record.id);
		if (record.outcome === "void") {
			sink.finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
		} else if (record.outcome === "returned" && record.value !== undefined) {
			sink.finish({
				type: RpcCallTerminalTypeEnum.returned,
				value: this.#host.normalizeApplicationValue(record.value),
			});
		} else {
			sink.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: record.code ?? RpcExceptionCodeEnum.handlerFailed,
			});
		}
	}

	async #receiveStreamStart(
		record: Extract<MemoryProtocolRecord, { readonly kind: "stream-start" }>,
	): Promise<void> {
		const request: RpcProtocolStreamRequest =
			record.streamKind === "stream-method"
				? {
						service: record.service,
						member: record.member,
						kind: "stream-method",
						args: this.#host.normalizeApplicationArguments(record.args ?? []),
					}
				: {
						service: record.service,
						member: record.member,
						kind: "stream-property",
					};
		const reservation = this.#sessionHost?.reserveIncomingStream(request);
		if (reservation === undefined) {
			this.#pendingTerminalAcks.add(record.id);
			await this.#sendStreamTerminal(record.id, 0, {
				type: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			return;
		}
		if (reservation.kind === "unknown") {
			const control = reservation.reservation.commit();
			const outcome = { type: "failed", code: reservation.code } as const;
			await new Promise<void>((resolve) => control.finish(outcome, resolve));
			this.#pendingTerminalAcks.add(record.id);
			await this.#sendStreamTerminal(record.id, 0, outcome);
			return;
		}
		let state: MemoryIncomingStream | undefined;
		const source: IRpcProtocolSourceSink = {
			reserveEmission: () => {
				if (
					state === undefined ||
					state.closed ||
					state.itemThrough >= state.creditThrough
				) {
					if (state !== undefined && !state.closed) {
						this.#finishIncomingStream(state, {
							type: "failed",
							code: RpcExceptionCodeEnum.overflow,
						});
					}
					return undefined;
				}
				let open = true;
				return {
					commit: (snapshot) => {
						if (!open || state === undefined || state.closed) {
							return;
						}
						open = false;
						state.itemThrough += 1;
						const itemRecord = {
							kind: "stream-item",
							id: record.id,
							ordinal: state.itemThrough,
							value: snapshot.value,
						} as const;
						if (this.#mutant === "terminal-before-item") {
							void Promise.resolve().then(() =>
								this.#sendIgnoringFailure(itemRecord),
							);
						} else {
							this.#sendIgnoringFailure(itemRecord);
						}
					},
					fail: () => {
						if (!open || state === undefined || state.closed) {
							return;
						}
						open = false;
						this.#finishIncomingStream(state, {
							type: "failed",
							code: RpcExceptionCodeEnum.handlerFailed,
						});
					},
				};
			},
			finish: (outcome) => {
				if (state !== undefined) {
					this.#finishIncomingStream(state, outcome);
				}
			},
		};
		const control = reservation.reservation.commit(source);
		state = {
			request,
			source,
			control,
			itemThrough: 0,
			creditThrough: 1,
			closed: false,
			released: false,
		};
		this.#incomingStreams.set(record.id, state);
	}

	async #receiveStreamItem(
		record: Extract<MemoryProtocolRecord, { readonly kind: "stream-item" }>,
	): Promise<void> {
		const stream = this.#outgoingStreams.get(record.id);
		const itemIsInvalid =
			stream === undefined ||
			stream.closed ||
			record.ordinal !== stream.receivedItems + 1 ||
			record.ordinal > stream.creditThrough;
		if (itemIsInvalid) {
			if (this.#mutant === "accept-over-credit") {
				return;
			}
			this.#sessionHost?.fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Memory Protocol received an over-credit stream item."),
			);
			return;
		}
		const projection = stream.sink.reserveItem(
			this.#host.normalizeApplicationValue(record.value),
		);
		stream.receivedItems = record.ordinal;
		const effect = projection.commit();
		if (effect === "rearm" && !stream.closed) {
			stream.creditThrough += 1;
			await this.#send({
				kind: "stream-credit",
				id: record.id,
				through: stream.creditThrough,
			});
		}
	}

	#receiveStreamCredit(
		record: Extract<MemoryProtocolRecord, { readonly kind: "stream-credit" }>,
	): void {
		const stream = this.#incomingStreams.get(record.id);
		if (stream === undefined || stream.closed) {
			return;
		}
		if (record.through !== stream.creditThrough + 1) {
			this.#sessionHost?.fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Memory Protocol received an invalid stream credit."),
			);
			return;
		}
		stream.creditThrough = record.through;
	}

	#receiveStreamCancel(id: number): void {
		const stream = this.#incomingStreams.get(id);
		if (stream !== undefined) {
			this.#finishIncomingStream(stream, { type: "canceled" });
		}
	}

	#receiveStreamTerminal(
		record: Extract<MemoryProtocolRecord, { readonly kind: "stream-terminal" }>,
	): void {
		const stream = this.#outgoingStreams.get(record.id);
		const terminalOvertookItem =
			stream !== undefined &&
			!stream.closed &&
			record.itemThrough === stream.receivedItems + 1;
		if (
			stream === undefined ||
			stream.closed ||
			(record.itemThrough !== stream.receivedItems &&
				!(terminalOvertookItem && this.#mutant === "terminal-before-item"))
		) {
			this.#sessionHost?.fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Memory Protocol stream terminal overtook an item."),
			);
			return;
		}
		const outcome: RpcStreamOutcome =
			record.outcome === "completed"
				? { type: "completed" }
				: record.outcome === "canceled"
					? { type: "canceled" }
					: {
							type: "failed",
							code: record.code ?? RpcExceptionCodeEnum.handlerFailed,
						};
		const projection = stream.sink.reserveTerminal(outcome);
		stream.closed = true;
		this.#outgoingStreams.delete(record.id);
		projection.commit();
		this.#sendIgnoringFailure({ kind: "stream-terminal-ack", id: record.id });
		this.#checkDrained();
	}

	#receiveStreamTerminalAck(id: number): void {
		if (!this.#pendingTerminalAcks.delete(id)) {
			this.#sessionHost?.fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Memory Protocol received an unknown stream terminal ACK."),
			);
			return;
		}
		if (this.#mutant === "terminal-ack-over-retirement") {
			this.#outgoingStreams.clear();
		}
		this.#checkDrained();
	}

	#finishIncomingStream(
		stream: MemoryIncomingStream,
		outcome: RpcIncomingStreamTerminal | { readonly type: "completed" },
	): void {
		if (stream.closed) {
			return;
		}
		stream.closed = true;
		const incomingOutcome: RpcIncomingStreamTerminal = outcome;
		stream.control.finish(incomingOutcome, () => {
			if (stream.released) {
				return;
			}
			stream.released = true;
			for (const [id, candidate] of this.#incomingStreams) {
				if (candidate === stream) {
					this.#incomingStreams.delete(id);
					this.#pendingTerminalAcks.add(id);
					void this.#sendStreamTerminal(
						id,
						stream.itemThrough,
						incomingOutcome,
					).catch(() => undefined);
					break;
				}
			}
			this.#checkDrained();
		});
	}

	#sendStreamTerminal(
		id: number,
		itemThrough: number,
		outcome: RpcIncomingStreamTerminal | RpcStreamOutcome,
	): Promise<void> {
		return this.#send({
			kind: "stream-terminal",
			id,
			itemThrough,
			outcome:
				outcome.type === "completed"
					? "completed"
					: outcome.type === "canceled"
						? "canceled"
						: "failed",
			...(outcome.type === "failed" ? { code: outcome.code } : {}),
		});
	}

	#checkDrained(): void {
		if (
			!this.#draining ||
			this.#closing ||
			this.#outgoing.size > 0 ||
			this.#incoming.size > 0 ||
			this.#outgoingStreams.size > 0 ||
			this.#incomingStreams.size > 0 ||
			this.#pendingTerminalAcks.size > 0
		) {
			return;
		}
		this.#closing = true;
		void this.#send({ kind: "close" })
			.catch(() => undefined)
			.finally(() => {
				void this.#connection?.close().finally(() => {
					this.#shutdown?.resolve(undefined);
				});
			});
	}

	#send(record: MemoryProtocolRecord): Promise<void> {
		const task = this.#sendTail.then(() => {
			if (this.#connection === undefined) {
				throw new Error("Protocol is not bound.");
			}
			return this.#connection.send(encodeMemoryRecord(record));
		});
		this.#sendTail = task.catch(() => undefined);
		return task.catch((error) => {
			if (!this.#closing) {
				if (this.#mutant === "adapter-rejection-overflow") {
					for (const stream of this.#outgoingStreams.values()) {
						if (!stream.closed) {
							stream.closed = true;
							stream.sink
								.reserveTerminal({
									type: "failed",
									code: RpcExceptionCodeEnum.overflow,
								})
								.commit();
						}
					}
				}
				this.#sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.recovering,
					cause: error instanceof Error ? error : new Error(String(error)),
				});
			}
			throw error;
		});
	}

	#sendIgnoringFailure(record: MemoryProtocolRecord): void {
		void this.#send(record).catch(() => undefined);
	}

	#reacquireSourcesForMutant(): void {
		if (this.#mutant !== "reacquire-on-recovery") {
			return;
		}
		for (const stream of this.#incomingStreams.values()) {
			const reservation = this.#sessionHost?.reserveIncomingStream(
				stream.request,
			);
			if (reservation?.kind === "source") {
				reservation.reservation.commit(stream.source);
			}
		}
	}
}

class MemoryProtocolSession implements IRpcProtocolSession {
	readonly #runtime: MemoryProtocolRuntime;

	public constructor(runtime: MemoryProtocolRuntime) {
		this.#runtime = runtime;
	}

	public reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		return this.#runtime.reserveInvocation(request);
	}

	public reserveStream(
		request: RpcProtocolStreamRequest,
	): IRpcProtocolStreamReservation | undefined {
		return this.#runtime.reserveStream(request);
	}

	public forceClose(): void {
		this.#runtime.forceSession();
	}
}

function handlerOutcomeRecord(
	id: number,
	outcome: RpcHandlerOutcome,
): MemoryProtocolRecord {
	if (outcome.type === RpcCallTerminalTypeEnum.returnedVoid) {
		return { kind: "result", id, outcome: "void" };
	}
	if (outcome.type === RpcCallTerminalTypeEnum.returned) {
		return {
			kind: "result",
			id,
			outcome: "returned",
			value: outcome.value.value,
		};
	}
	return {
		kind: "result",
		id,
		outcome: "failed",
		code:
			outcome.type === RpcCallTerminalTypeEnum.failed
				? outcome.code
				: RpcExceptionCodeEnum.canceled,
	};
}

function encodeMemoryRecord(record: MemoryProtocolRecord): Uint8Array {
	return new Uint8Array(serialize(record));
}

function decodeMemoryRecord(message: Uint8Array): MemoryProtocolRecord {
	return deserialize(message) as MemoryProtocolRecord;
}

export function createMemoryConnectorFixture(): IRpcConnectorAdapterConformanceFixture {
	return {
		async create() {
			const connectionSource = new Subject<IRpcConnection>();
			const started = Promise.withResolvers<void>();
			const startup = Promise.withResolvers<void>();
			let used = false;
			let handedOff = false;
			let terminal = false;
			let signal: AbortSignal | undefined;
			let abortListener: (() => void) | undefined;

			const adapter: IRpcConnectorAdapter = {
				connection$: connectionSource.asObservable(),
				connect(nextSignal) {
					if (used) {
						return Promise.reject(
							new Error("Connector Adapter is single-use."),
						);
					}
					used = true;
					signal = nextSignal;
					abortListener = () => {
						if (handedOff || terminal) {
							return;
						}
						terminal = true;
						connectionSource.complete();
						startup.reject(
							new DOMException("Connection aborted.", "AbortError"),
						);
					};
					nextSignal.addEventListener("abort", abortListener, { once: true });
					started.resolve(undefined);
					if (nextSignal.aborted) {
						abortListener();
					}
					return startup.promise;
				},
			};

			return {
				adapter,
				async handoff(firstMessage) {
					await started.promise;
					if (terminal) {
						throw new Error("Connector startup is terminal.");
					}
					const pair = createConnectionPair();
					connectionSource.next(pair.connection);
					handedOff = true;
					if (firstMessage !== undefined) {
						await pair.remote.sendToAdapter(firstMessage);
					}
					terminal = true;
					connectionSource.complete();
					startup.resolve(undefined);
					return pair.remote;
				},
				async failStartup(error) {
					await started.promise;
					terminal = true;
					connectionSource.error(error);
					startup.reject(error);
				},
				async cleanup() {
					if (signal !== undefined && abortListener !== undefined) {
						signal.removeEventListener("abort", abortListener);
					}
				},
			};
		},
	};
}

export function createMemoryAcceptorFixture(): IRpcAcceptorAdapterConformanceFixture {
	return {
		async create() {
			const connectionSource = new Subject<IRpcConnection>();
			const started = Promise.withResolvers<void>();
			const startup = Promise.withResolvers<void>();
			let used = false;
			let ready = false;
			let terminal = false;
			let signal: AbortSignal | undefined;
			let abortListener: (() => void) | undefined;

			const adapter: IRpcAcceptorAdapter = {
				connection$: connectionSource.asObservable(),
				listen(nextSignal) {
					if (used) {
						return Promise.reject(new Error("Acceptor Adapter is single-use."));
					}
					used = true;
					signal = nextSignal;
					abortListener = () => {
						if (terminal) {
							return;
						}
						terminal = true;
						connectionSource.complete();
						if (!ready) {
							startup.reject(
								new DOMException("Listener aborted.", "AbortError"),
							);
						}
					};
					nextSignal.addEventListener("abort", abortListener, { once: true });
					started.resolve(undefined);
					if (nextSignal.aborted) {
						abortListener();
					}
					return startup.promise;
				},
			};

			return {
				adapter,
				async accept(firstMessage) {
					await started.promise;
					const pair = createConnectionPair();
					connectionSource.next(pair.connection);
					if (firstMessage !== undefined) {
						await pair.remote.sendToAdapter(firstMessage);
					}
					return pair.remote;
				},
				async markReady() {
					await started.promise;
					ready = true;
					startup.resolve(undefined);
				},
				async completeListener() {
					terminal = true;
					connectionSource.complete();
					if (!ready) {
						startup.reject(new Error("Listener completed before ready."));
					}
				},
				async failListener(error) {
					await started.promise;
					terminal = true;
					connectionSource.error(error);
					if (!ready) {
						startup.reject(error);
					}
				},
				async cleanup() {
					if (signal !== undefined && abortListener !== undefined) {
						signal.removeEventListener("abort", abortListener);
					}
				},
			};
		},
	};
}

function createConnectionPair(): ConnectionPair {
	const messageSource = new Subject<Uint8Array>();
	const adapterClosed = Promise.withResolvers<void>();
	const outbound: Uint8Array[] = [];
	const outboundWaiters: PromiseWithResolvers<Uint8Array>[] = [];
	let blocked = false;
	let pendingSend: PendingSend | undefined;
	let closed = false;
	let closeTask: Promise<void> | undefined;

	const admit = (message: Uint8Array): void => {
		const snapshot = message.slice();
		const waiter = outboundWaiters.shift();
		if (waiter === undefined) {
			outbound.push(snapshot);
		} else {
			waiter.resolve(snapshot);
		}
	};

	const connection: IRpcConnection = {
		message$: messageSource.asObservable(),
		send(message) {
			if (closed) {
				return Promise.reject(new Error("Connection is closed."));
			}
			if (!blocked) {
				admit(message);
				return Promise.resolve();
			}
			if (pendingSend !== undefined) {
				return Promise.reject(new Error("Only one send may be unsettled."));
			}
			const deferred = Promise.withResolvers<void>();
			pendingSend = { message, deferred };
			return deferred.promise;
		},
		close() {
			closed = true;
			if (closeTask === undefined) {
				pendingSend?.deferred.reject(
					new Error("Connection closed during send."),
				);
				pendingSend = undefined;
				messageSource.complete();
				adapterClosed.resolve(undefined);
				closeTask = Promise.resolve();
			}
			return closeTask;
		},
	};

	const remote: IRpcAdapterConformanceRemote = {
		async sendToAdapter(message) {
			if (closed) {
				throw new Error("Connection is closed.");
			}
			messageSource.next(message);
		},
		async receiveFromAdapter() {
			const message = outbound.shift();
			if (message !== undefined) {
				return message;
			}
			const waiter = Promise.withResolvers<Uint8Array>();
			outboundWaiters.push(waiter);
			return waiter.promise;
		},
		async setAdapterSendBlocked(nextBlocked) {
			blocked = nextBlocked;
			if (!blocked && pendingSend !== undefined) {
				const pending = pendingSend;
				pendingSend = undefined;
				admit(pending.message);
				pending.deferred.resolve(undefined);
			}
		},
		async closeFromRemote() {
			messageSource.complete();
		},
		async failFromRemote(error) {
			closed = true;
			pendingSend?.deferred.reject(error);
			pendingSend = undefined;
			messageSource.error(error);
			adapterClosed.resolve(undefined);
		},
		isAdapterClosed: () => closed,
		waitForAdapterClose: () => adapterClosed.promise,
	};

	return { connection, remote };
}
