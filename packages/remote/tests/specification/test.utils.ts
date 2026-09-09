/**
 * @overview Shared specification fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import { expect } from "vitest";
import {
	createRpcConnector,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type RpcConnectorRuntimePolicyOptions,
	type RpcEvent,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolAcceptorHost,
	IRpcProtocolCallRequest,
	IRpcProtocolConnectorHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcUnknownCallFailure,
} from "../../src/protocol";
import {
	RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";

export interface CalculatorService {
	add(left: number, right: number): number;
	cancel(value: string, signal: AbortSignal): Promise<string>;
}

export const ICalculatorService =
	createServiceIdentifier<CalculatorService>("ICalculatorService");

export const ICaseSensitiveService =
	createServiceIdentifier<CaseSensitiveService>("ICaseSensitiveService");

export const IDeferredService =
	createServiceIdentifier<DeferredService>("IDeferredService");

export const IRetainedReplayService =
	createServiceIdentifier<RetainedReplayService>("IRetainedReplayService");

export const sessionCapacityPolicy = {
	ackDelayMs: 1,
	activityProbeIntervalMs: 10,
	silenceTimeoutMs: 30,
	bindingAttemptTimeoutMs: 100,
	recoveryGraceMs: 1_000,
};

export function createProtocolHarness(): {
	readonly connectorFactory: RpcProtocolConnectorFactory;
	readonly acceptorFactory: RpcProtocolAcceptorFactory;
	readonly connectorHosts: IRpcProtocolConnectorHost[];
	readonly acceptorHosts: IRpcProtocolAcceptorHost[];
	readonly calls: {
		connectorBind: number;
		acceptorAccept: number;
		shutdown: number;
		close: number;
		cleanup: number;
	};
} {
	const connectorHosts: IRpcProtocolConnectorHost[] = [];
	const acceptorHosts: IRpcProtocolAcceptorHost[] = [];
	const calls = {
		connectorBind: 0,
		acceptorAccept: 0,
		shutdown: 0,
		close: 0,
		cleanup: 0,
	};

	const connectorFactory: RpcProtocolConnectorFactory = (host) => {
		connectorHosts.push(host);
		return {
			async bind() {
				calls.connectorBind += 1;
			},
			async shutdown() {
				calls.shutdown += 1;
			},
			close() {
				calls.close += 1;
			},
			async cleanup() {
				calls.cleanup += 1;
			},
		};
	};
	const acceptorFactory: RpcProtocolAcceptorFactory = (host) => {
		acceptorHosts.push(host);
		return {
			async accept() {
				calls.acceptorAccept += 1;
			},
			async shutdown() {
				calls.shutdown += 1;
			},
			close() {
				calls.close += 1;
			},
			async cleanup() {
				calls.cleanup += 1;
			},
		};
	};

	return {
		connectorFactory,
		acceptorFactory,
		connectorHosts,
		acceptorHosts,
		calls,
	};
}

export async function connectProtocolSession(
	session: IRpcProtocolSession,
	runtimePolicy?: RpcConnectorRuntimePolicyOptions,
): Promise<{
	readonly connector: IRpcConnector;
	readonly host: IRpcProtocolConnectorHost;
	readonly sessionHost: IRpcProtocolSessionHost;
	readonly events: RpcEvent[];
}> {
	const connectionSource = new Subject<IRpcConnection>();
	const messageSource = new Subject<Uint8Array>();
	let connectorHost: IRpcProtocolConnectorHost | undefined;
	let sessionHost: IRpcProtocolSessionHost | undefined;
	const protocolFactory: RpcProtocolConnectorFactory = (host) => {
		connectorHost = host;
		return {
			bind(connection) {
				connection.message$.subscribe();
				return Promise.resolve().then(() => {
					sessionHost = host.attachSession(session);
					if (sessionHost === undefined) {
						throw new Error("The test Session was not attached.");
					}
				});
			},
			async shutdown() {},
			close() {},
			async cleanup() {},
		};
	};
	const connector = createRpcConnector({ protocolFactory, runtimePolicy });
	const events: RpcEvent[] = [];
	connector.event$.subscribe((event) => events.push(event));
	await connector.connect({
		adapter: {
			connection$: connectionSource.asObservable(),
			async connect() {
				connectionSource.next({
					message$: messageSource.asObservable(),
					async send() {},
					async close() {},
				});
				connectionSource.complete();
			},
		},
	});
	if (connectorHost === undefined) {
		throw new Error("Expected a Connector Protocol host.");
	}
	if (sessionHost === undefined) {
		throw new Error("Expected a Connector Protocol Session host.");
	}
	return { connector, host: connectorHost, sessionHost, events };
}

export function consumeIncomingCall(
	host: IRpcProtocolSessionHost,
	request: IRpcProtocolCallRequest,
): ConsumedIncomingCall | undefined {
	let consumed: ConsumedIncomingCall | undefined;
	const reserved = host.reserveIncomingCall(request, (reservation) => {
		consumed =
			reservation.kind === RpcIncomingCallKindEnum.handler
				? { kind: "handler", call: reservation.commit() }
				: {
						kind: "unknown",
						code: reservation.code,
						call: reservation.commit(),
					};
		return undefined;
	});
	return reserved ? consumed : undefined;
}

export function createReconnectionProtocolHarness(): {
	readonly protocolFactory: RpcProtocolConnectorFactory;
	readonly sessionHost: () => IRpcProtocolSessionHost;
} {
	const session: IRpcProtocolSession = {
		prepareInvocation: () => undefined,
		forceClose() {},
	};
	let retainedSessionHost: IRpcProtocolSessionHost | undefined;
	const protocolFactory: RpcProtocolConnectorFactory = (host) => {
		return {
			bind() {
				return Promise.resolve().then(() => {
					if (retainedSessionHost === undefined) {
						retainedSessionHost = host.attachSession(session);
						if (retainedSessionHost === undefined) {
							throw new Error("The test Session was not attached.");
						}
						return;
					}
					retainedSessionHost.transition({
						type: RpcProtocolSessionTransitionTypeEnum.recovered,
					});
				});
			},
			async shutdown() {},
			close() {},
			async cleanup() {},
		};
	};

	return {
		protocolFactory,
		sessionHost: () => {
			if (retainedSessionHost === undefined) {
				throw new Error("The test Session has not been attached.");
			}
			return retainedSessionHost;
		},
	};
}

export function createSuccessfulConnectorAdapter(): IRpcConnectorAdapter {
	const connectionSource = new Subject<IRpcConnection>();
	return {
		connection$: connectionSource.asObservable(),
		async connect() {
			connectionSource.next({
				message$: new Subject<Uint8Array>().asObservable(),
				async send() {},
				async close() {},
			});
			connectionSource.complete();
		},
	};
}

export function captureThrownError(run: () => unknown): unknown {
	try {
		run();
	} catch (error) {
		return error;
	}
	return undefined;
}

export function expectSchemaFailureTypeError(error: unknown): void {
	expect(error).toBeInstanceOf(TypeError);
	if (!(error instanceof TypeError)) {
		throw new Error("Expected a TypeError schema failure projection.");
	}
	expect(error.cause).toBeInstanceOf(Error);
	if (!(error.cause instanceof Error)) {
		throw new Error("Expected the schema failure to be retained as cause.");
	}
	expect(error.message).toBe(error.cause.message);
}

interface CaseSensitiveService {
	Then(): void;
}

interface DeferredService {
	run(value: number): Promise<number>;
}

interface RetainedReplayService {
	run(left: string, right: string): Promise<void>;
}

type ConsumedIncomingCall =
	| Readonly<{
			readonly kind: "handler";
			readonly call: IRpcProtocolIncomingHandlerCall;
	  }>
	| Readonly<{
			readonly kind: "unknown";
			readonly code: RpcUnknownCallFailure;
			readonly call: IRpcProtocolIncomingCall;
	  }>;
