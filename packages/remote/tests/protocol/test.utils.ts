/**
 * @overview Deterministic in-memory Default Protocol network for wire and Recovery tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { createRpcSessionActivity } from "../../src/factories/rpc-session-activity.factory";
import { createRpcSessionCallRetention } from "../../src/factories/rpc-session-call-retention.factory";
import { createRpcSessionIncomingCalls } from "../../src/factories/rpc-session-incoming-calls.factory";
import { createRpcSessionInvocations } from "../../src/factories/rpc-session-invocations.factory";
import { RpcRetainedBytesLedgerImpl } from "../../src/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcEndpointImpl } from "../../src/impls/endpoint/rpc-endpoint.impl";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcSessionImpl } from "../../src/impls/session/rpc-session.impl";
import type {
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type { IRpcSessionBinding } from "../../src/interfaces/session/rpc-session.interface";
import type { RpcSessionInvocationsFactory } from "../../src/interfaces/session/rpc-session-invocations.interface";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "../../src/interfaces/transport/rpc-adapter.interface";
import type { IRpcConnection } from "../../src/interfaces/transport/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

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

export interface IRpcTestNetwork {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: IRpcCapturedRecord[];
	createConnectorAdapter(
		closeBehavior?: "propagate" | "silent",
		onClose?: (direction: "connector" | "acceptor") => void,
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
	receive(message: Uint8Array): void;
	installReplacement(peerReceivedThrough?: number): void;
}

export function createRpcDirectSessionHarness(
	policyOverrides: Partial<IRpcProtocolRuntimePolicy> = {},
	createInvocations: RpcSessionInvocationsFactory = createRpcSessionInvocations,
): IRpcDirectSessionHarness {
	const sent: Readonly<Record<string, unknown>>[] = [];
	const transitions: RpcProtocolSessionTransition[] = [];
	const faults: RpcProtocolFaultReason[] = [];
	const decoder = new TextDecoder();
	let sendSettlement: Promise<void> | undefined;
	let activeBinding: IRpcSessionBinding | undefined;
	let bindingEpoch = 1;
	const policy: IRpcProtocolRuntimePolicy = {
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
		...policyOverrides,
	};
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const host: IRpcProtocolHost = {
		policy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason) => faults.push(reason),
	};
	const createEndpoint = (): Readonly<{
		endpoint: RpcEndpointImpl;
		install(binding: IRpcSessionBinding): void;
	}> => {
		let binding: IRpcSessionBinding | undefined;
		const endpoint = new RpcEndpointImpl({
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
			onMessage: (bytes) => binding?.receive(bytes),
			onFailure: (reason, error) => binding?.fail(reason, error),
		});
		return {
			endpoint,
			install(nextBinding) {
				binding = nextBinding;
			},
		};
	};
	const created = new RpcSessionImpl(
		{
			host,
			sessionId: "direct-session",
			resumeToken: "direct-resume-token",
			onTerminal: () => {},
		},
		{
			codec,
			createActivity: createRpcSessionActivity,
			createCallRetention: createRpcSessionCallRetention,
			createIncomingCalls: createRpcSessionIncomingCalls,
			createInvocations,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				policy.maxRetainedBytesPerSession,
			),
		},
	);
	const sessionHost: IRpcProtocolSessionHost = {
		reserveIncomingCall: () => false,
		transition: (transition) => transitions.push(transition),
		fault: (reason) => faults.push(reason),
	};
	const initialEndpoint = createEndpoint();
	const initialBinding = created
		.prepareFresh(sessionHost)
		.install(initialEndpoint.endpoint);
	initialEndpoint.install(initialBinding);
	activeBinding = initialBinding;
	if (!initialBinding.activate()) {
		throw new Error("Expected the direct Session binding to activate.");
	}
	return {
		session: created,
		sent,
		transitions,
		faults,
		setSendSettlement(settlement) {
			sendSettlement = settlement;
		},
		receive(message) {
			if (activeBinding === undefined) {
				throw new Error("Expected an active direct Session binding.");
			}
			activeBinding.receive(message);
		},
		installReplacement(peerReceivedThrough = 0) {
			const resume = created.beginResume();
			bindingEpoch += 1;
			const decision = resume.review({
				kind: "accepted",
				profile: "husky-di-rpc/1",
				sessionId: "direct-session",
				bindingEpoch,
				cursor: peerReceivedThrough,
			});
			if (decision.kind !== "bind") {
				throw new Error("Expected a replacement binding plan.");
			}
			const endpoint = createEndpoint();
			const binding = decision.plan.install(endpoint.endpoint);
			endpoint.install(binding);
			activeBinding = binding;
			if (!binding.activate()) {
				throw new Error("Expected the replacement binding to activate.");
			}
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
		createConnectorAdapter(closeBehavior = "propagate", onClose) {
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
					const close = async (
						direction: "connector" | "acceptor",
					): Promise<void> => {
						if (closed) {
							return;
						}
						closed = true;
						onClose?.(direction);
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
						close: () => close(direction),
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

interface IRpcTestLink {
	readonly connectorIngress: Subject<Uint8Array>;
	readonly acceptorIngress: Subject<Uint8Array>;
}

const codec = new RpcCodecImpl();
