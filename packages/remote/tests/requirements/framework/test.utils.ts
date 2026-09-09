/**
 * @overview Shared requirements/framework-requirements fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcAcceptor,
	type IRpcConnection,
	type IRpcConnector,
	type RpcEvent,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolCallRequest,
	IRpcProtocolConnectorHost,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../../src/protocol";

export { requirementDescriptor };

export function createEmptySession(): IRpcProtocolSession {
	return {
		prepareInvocation: () => undefined,
		forceClose() {},
	};
}

export function consumeIncomingKind(
	host: IRpcProtocolSessionHost | undefined,
	request: IRpcProtocolCallRequest,
): "handler" | "unknown" | undefined {
	let kind: "handler" | "unknown" | undefined;
	host?.reserveIncomingCall(request, (reservation) => {
		kind = reservation.kind;
		const call = reservation.commit();
		call.finish(
			reservation.kind === "unknown"
				? {
						type: RpcCallTerminalTypeEnum.failed,
						code: reservation.code,
					}
				: { type: RpcCallTerminalTypeEnum.sessionTerminated },
		);
		return undefined;
	});
	return kind;
}

export function createConnectorHarness(options: ConnectorHarnessOptions = {}): {
	readonly connector: IRpcConnector;
	readonly host: IRpcProtocolConnectorHost;
	readonly session: IRpcProtocolSession;
	readonly events: RpcEvent[];
	readonly calls: {
		bind: number;
		shutdown: number;
		close: number;
		cleanup: number;
		connectionClose: number;
	};
	connect(): Promise<IRpcProtocolSessionHost>;
} {
	const session = options.session ?? createEmptySession();
	const calls = {
		bind: 0,
		shutdown: 0,
		close: 0,
		cleanup: 0,
		connectionClose: 0,
	};
	let connectorHost: IRpcProtocolConnectorHost | undefined;
	let sessionHost: IRpcProtocolSessionHost | undefined;
	const protocolFactory: RpcProtocolConnectorFactory = (host) => {
		connectorHost = host;
		return {
			bind(connection) {
				calls.bind += 1;
				connection.message$.subscribe();
				return Promise.resolve().then(() => {
					sessionHost = host.attachSession(session);
					if (sessionHost === undefined) {
						throw new Error("Expected the test Session to attach.");
					}
				});
			},
			shutdown() {
				calls.shutdown += 1;
				return options.shutdown?.() ?? Promise.resolve();
			},
			close() {
				calls.close += 1;
				options.close?.();
			},
			cleanup() {
				calls.cleanup += 1;
				return options.cleanup?.() ?? Promise.resolve();
			},
		};
	};
	const connector = createRpcConnector({
		protocolFactory,
		runtimePolicy: { shutdownDeadlineMs: 50 },
	});
	if (connectorHost === undefined) {
		throw new Error("Expected a Connector Protocol host.");
	}
	const host = connectorHost;
	const events: RpcEvent[] = [];
	connector.event$.subscribe((event) => events.push(event));

	return {
		connector,
		host,
		session,
		events,
		calls,
		async connect() {
			const connectionSource = new Subject<IRpcConnection>();
			const messageSource = new Subject<Uint8Array>();
			await connector.connect({
				adapter: {
					connection$: connectionSource.asObservable(),
					connect() {
						connectionSource.next({
							message$: messageSource.asObservable(),
							async send() {},
							async close() {
								calls.connectionClose += 1;
								messageSource.complete();
							},
						});
						connectionSource.complete();
						return Promise.resolve();
					},
				},
			});
			if (sessionHost === undefined) {
				throw new Error("Expected a Connector Protocol Session host.");
			}
			return sessionHost;
		},
	};
}

export function createAcceptorHarness(
	options: { readonly cleanup?: () => Promise<void> } = {},
): {
	readonly acceptor: IRpcAcceptor;
	readonly host: IRpcProtocolAcceptorHost;
} {
	let acceptorHost: IRpcProtocolAcceptorHost | undefined;
	const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
		acceptorHost = host;
		return {
			async accept() {},
			async shutdown() {},
			close() {},
			cleanup: options.cleanup ?? (() => Promise.resolve()),
		};
	};
	const acceptor = createRpcAcceptor({
		protocolFactory,
		runtimePolicy: { shutdownDeadlineMs: 50 },
	});
	if (acceptorHost === undefined) {
		throw new Error("Expected an Acceptor Protocol host.");
	}
	return { acceptor, host: acceptorHost };
}

interface RequirementService {
	cancel(value: string, signal: AbortSignal): Promise<string>;
	echo(value: { readonly secret: string }): { readonly secret: string };
	wait(): Promise<string>;
}

interface ConnectorHarnessOptions {
	readonly session?: IRpcProtocolSession;
	readonly shutdown?: () => Promise<void>;
	readonly close?: () => void;
	readonly cleanup?: () => Promise<void>;
}

const IRequirementService = createServiceIdentifier<RequirementService>(
	"IRequirementService",
);

const requirementDescriptor = createRemoteServiceDescriptor(
	IRequirementService,
	{
		wireName: "example.requirements.v1",
		methods: { cancel: { cancelable: true }, echo: true, wait: true },
	},
);
