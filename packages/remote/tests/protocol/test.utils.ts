/**
 * @overview Deterministic in-memory Default Protocol network for wire and Recovery tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcEndpointImpl } from "../../src/impls/protocol/rpc-endpoint.impl";
import { RpcSessionImpl } from "../../src/impls/protocol/rpc-session.impl";
import type {
	IRpcProtocolHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "../../src/interfaces/rpc-adapter.interface";
import type { IRpcConnection } from "../../src/interfaces/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

const codec = new RpcCodecImpl();

export interface IRpcCapturedRecord {
	readonly connectionId: number;
	readonly direction: "connector" | "acceptor";
	readonly value: Readonly<Record<string, unknown>>;
}

export interface IRpcSendDirective {
	readonly drop?: boolean;
	readonly message?: Uint8Array;
	readonly settlement?: Promise<void>;
}

interface IRpcTestLink {
	readonly connectorIngress: Subject<Uint8Array>;
	readonly acceptorIngress: Subject<Uint8Array>;
}

export interface IRpcTestNetwork {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: IRpcCapturedRecord[];
	createConnectorAdapter(
		closeBehavior?: "propagate" | "silent",
	): IRpcConnectorAdapter;
	setInterceptor(
		interceptor:
			| ((
					record: IRpcCapturedRecord,
					message: Uint8Array,
			  ) => IRpcSendDirective | undefined)
			| undefined,
	): void;
	emit(
		connectionId: number,
		target: "connector" | "acceptor",
		message: Uint8Array,
	): void;
}

export interface IRpcDirectSessionHarness {
	readonly session: RpcSessionImpl;
	readonly sent: Readonly<Record<string, unknown>>[];
	readonly transitions: RpcProtocolSessionTransition[];
	readonly faults: RpcProtocolFaultReason[];
	setSendSettlement(settlement: Promise<void> | undefined): void;
	installReplacement(peerReceivedThrough?: number): RpcEndpointImpl;
}

export function createRpcDirectSessionHarness(): IRpcDirectSessionHarness {
	const sent: Readonly<Record<string, unknown>>[] = [];
	const transitions: RpcProtocolSessionTransition[] = [];
	const faults: RpcProtocolFaultReason[] = [];
	const decoder = new TextDecoder();
	let sendSettlement: Promise<void> | undefined;
	let session: RpcSessionImpl | undefined;
	const host: IRpcProtocolHost = {
		policy: {
			maxSessions: 1,
			maxHandshakes: 1,
			maxPendingInvocationsPerSession: 256,
			maxRetainedBytesPerSession: 32 * 1024 * 1024,
			maxRetainedBytesTotal: 32 * 1024 * 1024,
			maxHandlersPerSession: 16,
			maxHandlersTotal: 16,
			ackDelayMs: 50,
			activityProbeIntervalMs: 30_000,
			silenceTimeoutMs: 120_000,
			sendProgressTimeoutMs: 30_000,
			bindingAttemptTimeoutMs: 30_000,
			recoveryGraceMs: 300_000,
			shutdownDeadlineMs: 5_000,
		},
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason) => faults.push(reason),
	};
	const createEndpoint = (): RpcEndpointImpl => {
		let endpoint: RpcEndpointImpl;
		endpoint = new RpcEndpointImpl({
			connection: {
				message$: new Subject<Uint8Array>().asObservable(),
				async send(bytes) {
					sent.push(
						JSON.parse(decoder.decode(bytes)) as Readonly<
							Record<string, unknown>
						>,
					);
					await sendSettlement;
				},
				async close() {},
			},
			onMessage: (bytes) => session?.receive(endpoint, bytes),
			onFailure: (reason, error) =>
				session?.endpointFailed(endpoint, reason, error),
		});
		return endpoint;
	};
	const created = new RpcSessionImpl({
		role: "connector",
		host,
		sessionId: "direct-session",
		proofKey: {} as CryptoKey,
		codec,
		onTerminal: () => {},
	});
	session = created;
	created.installHost({
		reserveIncomingCall: () => undefined,
		transition: (transition) => transitions.push(transition),
		fault: (reason) => faults.push(reason),
	});
	created.installBinding(createEndpoint(), 1, 0);
	created.activateBinding();
	return {
		session: created,
		sent,
		transitions,
		faults,
		setSendSettlement(settlement) {
			sendSettlement = settlement;
		},
		installReplacement(peerReceivedThrough = 0) {
			const endpoint = createEndpoint();
			created.installBinding(
				endpoint,
				created.bindingEpoch + 1,
				peerReceivedThrough,
			);
			created.activateBinding();
			return endpoint;
		},
	};
}

export function createRpcTestNetwork(): IRpcTestNetwork {
	const acceptorConnections = new Subject<IRpcConnection>();
	const links = new Map<number, IRpcTestLink>();
	const records: IRpcCapturedRecord[] = [];
	const decoder = new TextDecoder();
	let nextConnectionId = 0;
	let interceptor:
		| ((
				record: IRpcCapturedRecord,
				message: Uint8Array,
		  ) => IRpcSendDirective | undefined)
		| undefined;

	return {
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen() {},
		},
		records,
		createConnectorAdapter(closeBehavior = "propagate") {
			const connectorConnections = new Subject<IRpcConnection>();
			return {
				connection$: connectorConnections.asObservable(),
				async connect() {
					nextConnectionId += 1;
					const connectionId = nextConnectionId;
					const connectorIngress = new Subject<Uint8Array>();
					const acceptorIngress = new Subject<Uint8Array>();
					links.set(connectionId, { connectorIngress, acceptorIngress });
					let closed = false;
					const close = async (): Promise<void> => {
						if (closed) {
							return;
						}
						closed = true;
						if (closeBehavior === "propagate") {
							connectorIngress.complete();
							acceptorIngress.complete();
						}
					};
					const createConnection = (
						direction: "connector" | "acceptor",
						messageSource: Subject<Uint8Array>,
						peerSource: Subject<Uint8Array>,
					): IRpcConnection => ({
						message$: messageSource.asObservable(),
						async send(message) {
							const snapshot = message.slice();
							const record: IRpcCapturedRecord = {
								connectionId,
								direction,
								value: JSON.parse(decoder.decode(snapshot)) as Readonly<
									Record<string, unknown>
								>,
							};
							records.push(record);
							const directive = interceptor?.(record, snapshot);
							await Promise.resolve();
							if (directive?.drop !== true) {
								peerSource.next(directive?.message ?? snapshot);
							}
							await directive?.settlement;
						},
						close,
					});
					connectorConnections.next(
						createConnection("connector", connectorIngress, acceptorIngress),
					);
					acceptorConnections.next(
						createConnection("acceptor", acceptorIngress, connectorIngress),
					);
					connectorConnections.complete();
				},
			};
		},
		setInterceptor(nextInterceptor) {
			interceptor = nextInterceptor;
		},
		emit(connectionId, target, message) {
			const link = links.get(connectionId);
			if (target === "connector") {
				link?.connectorIngress.next(message.slice());
			} else {
				link?.acceptorIngress.next(message.slice());
			}
		},
	};
}
