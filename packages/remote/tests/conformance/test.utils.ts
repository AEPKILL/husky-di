/**
 * @overview Deterministic in-memory candidates for conformance runner self-tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

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
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationReservation,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcApplicationValue,
	RpcCallFailure,
	RpcHandlerOutcome,
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
	| { readonly kind: "fault" }
	| { readonly kind: "close" };

const memoryProtocolEncoder = new TextEncoder();
const memoryProtocolDecoder = new TextDecoder();

export function createMemoryProtocolFixture(): IRpcProtocolConformanceFixture {
	return {
		protocol: createMemoryProtocol(false),
		counterExhaustionProtocol: createMemoryProtocol(true),
		createActiveProtocolFaultMessage: () =>
			encodeMemoryRecord({ kind: "fault" }),
	};
}

function createMemoryProtocol(counterExhaustion: boolean): IRpcProtocol {
	return Object.freeze({
		createConnector: (host: IRpcProtocolConnectorHost) =>
			new MemoryProtocolRuntime("connector", host, counterExhaustion),
		createAcceptor: (host: IRpcProtocolAcceptorHost) =>
			new MemoryProtocolRuntime("acceptor", host, counterExhaustion),
	});
}

class MemoryProtocolRuntime
	implements IRpcProtocolConnectorRuntime, IRpcProtocolAcceptorRuntime
{
	private readonly _role: "connector" | "acceptor";
	private readonly _host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost;
	private readonly _counterExhaustion: boolean;
	private readonly _binding = Promise.withResolvers<void>();
	private readonly _outgoing = new Map<number, IRpcProtocolInvocationSink>();
	private readonly _incoming = new Map<
		number,
		{
			finish(outcome: {
				readonly type: RpcCallTerminalTypeEnum.failed;
				readonly code: RpcExceptionCodeEnum.canceled;
			}): void;
		}
	>();
	private _connection: IRpcConnection | undefined;
	private _session: MemoryProtocolSession | undefined;
	private _sessionHost: IRpcProtocolSessionHost | undefined;
	private _nextCallId = 1;
	private _closing = false;
	private _cleanupTask: Promise<void> | undefined;

	public constructor(
		role: "connector" | "acceptor",
		host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
		counterExhaustion: boolean,
	) {
		this._role = role;
		this._host = host;
		this._counterExhaustion = counterExhaustion;
	}

	public bind(connection: IRpcConnection, _signal: AbortSignal): Promise<void> {
		if (this._role !== "connector") {
			return Promise.reject(new Error("Only the Connector runtime can bind."));
		}
		this._subscribe(connection);
		void Promise.resolve().then(() => this._send({ kind: "hello" }));
		return this._binding.promise;
	}

	public accept(
		connection: IRpcConnection,
		_signal: AbortSignal,
	): Promise<void> {
		if (this._role !== "acceptor") {
			return Promise.reject(new Error("Only the Acceptor runtime can accept."));
		}
		this._subscribe(connection);
		return this._binding.promise;
	}

	public async shutdown(): Promise<void> {
		this._closing = true;
		if (this._connection !== undefined) {
			await this._send({ kind: "close" });
			await this._connection.close();
		}
	}

	public close(): void {
		this._closing = true;
		for (const sink of this._outgoing.values()) {
			sink.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
		}
		this._outgoing.clear();
		void this._connection?.close();
	}

	public cleanup(): Promise<void> {
		this._cleanupTask ??= Promise.resolve();
		return this._cleanupTask;
	}

	public reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		if (this._closing || this._sessionHost === undefined) {
			return undefined;
		}
		if (this._counterExhaustion && this._nextCallId === 1) {
			this._sessionHost.transition({
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
				const id = this._nextCallId;
				this._nextCallId += 1;
				return {
					start: () => {
						this._outgoing.set(id, sink);
						void this._send({
							kind: "call",
							id,
							service: request.service,
							method: request.method,
							args: request.args.value,
						});
					},
					cancel: () => void this._send({ kind: "cancel", id }),
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

	public forceSession(): void {
		this.close();
	}

	private _subscribe(connection: IRpcConnection): void {
		this._connection = connection;
		connection.message$.subscribe({
			next: (message) => {
				void this._receive(message).catch((error: unknown) => {
					const cause =
						error instanceof Error ? error : new Error(String(error));
					if (this._sessionHost === undefined) {
						this._host.fault(RpcCloseReasonEnum.protocolFault, cause);
					} else {
						this._sessionHost.fault(RpcCloseReasonEnum.protocolFault, cause);
					}
				});
			},
		});
	}

	private async _receive(message: Uint8Array): Promise<void> {
		const record = decodeMemoryRecord(message);
		switch (record.kind) {
			case "hello":
				this._installSession();
				await this._send({ kind: "welcome" });
				this._binding.resolve(undefined);
				break;
			case "welcome":
				this._installSession();
				this._binding.resolve(undefined);
				break;
			case "call":
				await this._receiveCall(record);
				break;
			case "cancel": {
				const call = this._incoming.get(record.id);
				call?.finish({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.canceled,
				});
				this._incoming.delete(record.id);
				await this._send({
					kind: "result",
					id: record.id,
					outcome: "failed",
					code: RpcExceptionCodeEnum.canceled,
				});
				break;
			}
			case "result":
				this._receiveResult(record);
				break;
			case "fault":
				this._sessionHost?.fault(
					RpcCloseReasonEnum.protocolFault,
					new Error("Active Protocol fault fixture."),
				);
				break;
			case "close":
				this._sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason: RpcCloseReasonEnum.remoteTerminated,
				});
				this._closing = true;
				await this._connection?.close();
				break;
		}
	}

	private _installSession(): void {
		if (this._session !== undefined) {
			return;
		}
		const session = new MemoryProtocolSession(this);
		const sessionHost =
			this._role === "connector"
				? (this._host as IRpcProtocolConnectorHost).attachSession(session)
				: (this._host as IRpcProtocolAcceptorHost).admitSession(session);
		if (sessionHost === undefined) {
			throw new Error("Session admission rejected.");
		}
		this._session = session;
		this._sessionHost = sessionHost;
	}

	private async _receiveCall(
		record: Extract<MemoryProtocolRecord, { readonly kind: "call" }>,
	): Promise<void> {
		const args = this._host.normalizeApplicationArguments(record.args);
		const reserved = this._sessionHost?.reserveIncomingCall({
			service: record.service,
			method: record.method,
			args,
		});
		if (reserved === undefined) {
			await this._send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			return;
		}
		if (reserved.kind === "unknown") {
			reserved.reservation.commit();
			await this._send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: reserved.code,
			});
			return;
		}
		const call = reserved.reservation.commit();
		this._incoming.set(record.id, call);
		const outcome = await call.handlerOutcome;
		this._incoming.delete(record.id);
		await this._send(handlerOutcomeRecord(record.id, outcome));
	}

	private _receiveResult(
		record: Extract<MemoryProtocolRecord, { readonly kind: "result" }>,
	): void {
		const sink = this._outgoing.get(record.id);
		if (sink === undefined) {
			return;
		}
		this._outgoing.delete(record.id);
		if (record.outcome === "void") {
			sink.finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
		} else if (record.outcome === "returned" && record.value !== undefined) {
			sink.finish({
				type: RpcCallTerminalTypeEnum.returned,
				value: this._host.normalizeApplicationValue(record.value),
			});
		} else {
			sink.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: record.code ?? RpcExceptionCodeEnum.handlerFailed,
			});
		}
	}

	private _send(record: MemoryProtocolRecord): Promise<void> {
		if (this._connection === undefined) {
			return Promise.reject(new Error("Protocol is not bound."));
		}
		return this._connection.send(encodeMemoryRecord(record));
	}
}

class MemoryProtocolSession implements IRpcProtocolSession {
	private readonly _runtime: MemoryProtocolRuntime;

	public constructor(runtime: MemoryProtocolRuntime) {
		this._runtime = runtime;
	}

	public reserveInvocation(
		request: IRpcProtocolInvocationRequest,
	): IRpcProtocolInvocationReservation | undefined {
		return this._runtime.reserveInvocation(request);
	}

	public forceClose(): void {
		this._runtime.forceSession();
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
	return memoryProtocolEncoder.encode(JSON.stringify(record));
}

function decodeMemoryRecord(message: Uint8Array): MemoryProtocolRecord {
	return JSON.parse(
		memoryProtocolDecoder.decode(message),
	) as MemoryProtocolRecord;
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
