/**
 * @overview Shared conformance/test.utils.ts fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type {
	IRpcProtocolConformanceFixture,
	RpcProtocolConformanceCandidate,
} from "../../../src/conformance";
import { RpcCloseReasonEnum, RpcExceptionCodeEnum } from "../../../src/index";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolCallRequest,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolInvocation,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcApplicationValue,
	RpcCallFailure,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcUnknownCallFailure,
} from "../../../src/modules/protocol";
import type { IRpcConnection } from "../../../src/modules/transport";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../../src/protocol";

export function createMemoryProtocolFixture(): IRpcProtocolConformanceFixture {
	return {
		protocol: createMemoryProtocol(false),
		counterExhaustionProtocol: createMemoryProtocol(true),
		createActiveProtocolFaultMessage: () =>
			encodeMemoryRecord({ kind: "fault" }),
	};
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

function createMemoryProtocol(
	counterExhaustion: boolean,
): RpcProtocolConformanceCandidate {
	return {
		connector: (host: IRpcProtocolConnectorHost) =>
			new MemoryProtocolRuntime("connector", host, counterExhaustion),
		acceptor: (host: IRpcProtocolAcceptorHost) =>
			new MemoryProtocolRuntime("acceptor", host, counterExhaustion),
	};
}

class MemoryProtocolRuntime
	implements IRpcProtocolConnector, IRpcProtocolAcceptor
{
	readonly #role: "connector" | "acceptor";
	readonly #host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost;
	readonly #counterExhaustion: boolean;
	readonly #binding = Promise.withResolvers<void>();
	readonly #prepared = new Set<(outcome: RpcCallOutcome) => void>();
	readonly #outgoing = new Map<number, (outcome: RpcCallOutcome) => void>();
	readonly #incoming = new Map<number, IRpcProtocolIncomingCall>();
	#connection: IRpcConnection | undefined;
	#session: MemoryProtocolSession | undefined;
	#sessionHost: IRpcProtocolSessionHost | undefined;
	#nextCallId = 1;
	#closing = false;
	#cleanupTask: Promise<void> | undefined;

	public constructor(
		role: "connector" | "acceptor",
		host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
		counterExhaustion: boolean,
	) {
		this.#role = role;
		this.#host = host;
		this.#counterExhaustion = counterExhaustion;
	}

	public bind(connection: IRpcConnection, _signal: AbortSignal): Promise<void> {
		if (this.#role !== "connector") {
			return Promise.reject(new Error("Only the Connector runtime can bind."));
		}
		this.#subscribe(connection);
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
		return this.#binding.promise;
	}

	public async shutdown(): Promise<void> {
		this.#closing = true;
		if (this.#connection !== undefined) {
			await this.#send({ kind: "close" });
			await this.#connection.close();
		}
	}

	public close(): void {
		this.#closing = true;
		for (const finish of [...this.#prepared]) {
			finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.unavailable,
			});
		}
		for (const finish of [...this.#outgoing.values()]) {
			finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
		}
		for (const call of this.#incoming.values()) {
			call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });
		}
		this.#incoming.clear();
		void this.#connection?.close();
	}

	public cleanup(): Promise<void> {
		this.#cleanupTask ??= Promise.resolve();
		return this.#cleanupTask;
	}

	public prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined {
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
		let phase: "pending" | "started" | "settled" = "pending";
		let id: number | undefined;
		const settle = (outcome: RpcCallOutcome): void => {
			if (phase === "settled") {
				return;
			}
			phase = "settled";
			this.#prepared.delete(settle);
			if (id !== undefined) {
				this.#outgoing.delete(id);
			}
			finish(outcome);
		};
		this.#prepared.add(settle);
		return {
			start: () => {
				if (phase !== "pending") {
					return;
				}
				phase = "started";
				this.#prepared.delete(settle);
				id = this.#nextCallId;
				this.#nextCallId += 1;
				this.#outgoing.set(id, settle);
				void this.#send({
					kind: "call",
					id,
					service: request.service,
					method: request.method,
					args: request.args.value,
				});
			},
			cancel: () => {
				if (phase === "settled") {
					return;
				}
				const startedId = phase === "started" ? id : undefined;
				settle({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.canceled,
				});
				if (startedId !== undefined) {
					void this.#send({ kind: "cancel", id: startedId });
				}
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
		const sessionHost = this.#sessionHost;
		if (sessionHost === undefined) {
			throw new Error("Memory Protocol has no Session host.");
		}
		let incoming:
			| {
					readonly kind: "unknown";
					readonly code: RpcUnknownCallFailure;
					readonly call: IRpcProtocolIncomingCall;
			  }
			| {
					readonly kind: "handler";
					readonly call: IRpcProtocolIncomingHandlerCall;
			  }
			| undefined;
		const reserved = sessionHost.reserveIncomingCall(
			{ service: record.service, method: record.method, args },
			(reservation) => {
				incoming =
					reservation.kind === "unknown"
						? {
								kind: "unknown",
								code: reservation.code,
								call: reservation.commit(),
							}
						: { kind: "handler", call: reservation.commit() };
				return undefined;
			},
		);
		if (!reserved) {
			await this.#send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: RpcExceptionCodeEnum.unavailable,
			});
			return;
		}
		if (incoming === undefined) {
			throw new Error("Memory Protocol host did not consume its reservation.");
		}
		if (incoming.kind === "unknown") {
			incoming.call.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: incoming.code,
			});
			await this.#send({
				kind: "result",
				id: record.id,
				outcome: "failed",
				code: incoming.code,
			});
			return;
		}
		const call = incoming.call;
		this.#incoming.set(record.id, call);
		const outcome = await call.handlerOutcome;
		if (!this.#incoming.delete(record.id)) {
			return;
		}
		call.finish(handlerOutcomeTerminal(outcome));
		await this.#send(handlerOutcomeRecord(record.id, outcome));
	}

	#receiveResult(
		record: Extract<MemoryProtocolRecord, { readonly kind: "result" }>,
	): void {
		const settle = this.#outgoing.get(record.id);
		if (settle === undefined) {
			return;
		}
		if (record.outcome === "void") {
			settle({ type: RpcCallTerminalTypeEnum.returnedVoid });
		} else if (record.outcome === "returned" && record.value !== undefined) {
			settle({
				type: RpcCallTerminalTypeEnum.returned,
				value: this.#host.normalizeApplicationValue(record.value),
			});
		} else {
			settle({
				type: RpcCallTerminalTypeEnum.failed,
				code: record.code ?? RpcExceptionCodeEnum.handlerFailed,
			});
		}
	}

	#send(record: MemoryProtocolRecord): Promise<void> {
		if (this.#connection === undefined) {
			return Promise.reject(new Error("Protocol is not bound."));
		}
		return this.#connection.send(encodeMemoryRecord(record));
	}
}

class MemoryProtocolSession implements IRpcProtocolSession {
	readonly #runtime: MemoryProtocolRuntime;

	public constructor(runtime: MemoryProtocolRuntime) {
		this.#runtime = runtime;
	}

	public prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined {
		return this.#runtime.prepareInvocation(request, finish);
	}

	public forceClose(): void {
		this.#runtime.forceSession();
	}
}

function handlerOutcomeTerminal(
	outcome: RpcHandlerOutcome,
): RpcIncomingTerminal {
	if (outcome.type === RpcCallTerminalTypeEnum.notStarted) {
		return {
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.canceled,
		};
	}
	return outcome;
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
