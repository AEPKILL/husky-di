/**
 * @overview Deterministic in-memory Default Protocol network for wire and Recovery tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
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
import type { RpcBindingEpoch } from "../../src/interfaces/session/rpc-session.interface";
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
): IRpcDirectSessionHarness {
	const sent: Readonly<Record<string, unknown>>[] = [];
	const transitions: RpcProtocolSessionTransition[] = [];
	const faults: RpcProtocolFaultReason[] = [];
	const decoder = new TextDecoder();
	let sendSettlement: Promise<void> | undefined;
	let activeBinding: RpcBindingEpoch | undefined;
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
		install(binding: RpcBindingEpoch): void;
	}> => {
		let binding: RpcBindingEpoch | undefined;
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
			onFailure: (reason, error) => binding?.failed(reason, error),
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
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				policy.maxRetainedBytesPerSession,
			),
		},
	);
	const sessionHost: IRpcProtocolSessionHost = {
		reserveIncomingCall: () => undefined,
		transition: (transition) => transitions.push(transition),
		fault: (reason) => faults.push(reason),
	};
	const initialEndpoint = createEndpoint();
	const initialCommit = created.commitBinding(
		created.prepareFreshBinding(sessionHost),
		initialEndpoint.endpoint,
	);
	if (initialCommit.kind !== "installed") {
		throw initialCommit.error;
	}
	initialEndpoint.install(initialCommit.binding);
	activeBinding = initialCommit.binding;
	if (!initialCommit.binding.activate()) {
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
			const resume = created.beginInitiatorResume();
			bindingEpoch += 1;
			const candidate = created.prepareInitiatorBinding(resume, {
				profile: "husky-di-rpc/1",
				sessionId: "direct-session",
				bindingEpoch,
				peerReceivedThrough,
			});
			if (candidate.kind !== "ready") {
				throw new Error("Expected a ready replacement binding candidate.");
			}
			const endpoint = createEndpoint();
			const commit = created.commitBinding(candidate, endpoint.endpoint);
			if (commit.kind !== "installed") {
				throw commit.error;
			}
			endpoint.install(commit.binding);
			activeBinding = commit.binding;
			if (!commit.binding.activate()) {
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
