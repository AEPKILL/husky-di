/**
 * @overview Generation-scoped host probes and tracked transport for Protocol cases.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { assertRpcConformance } from "@/conformance/rpc-conformance.util";
import type {
	ProtocolHostProbe,
	TrackedProtocolTransport,
} from "@/conformance/types/rpc-protocol-case.type";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";
export function createConnectorHostProbe(): {
	readonly host: IRpcProtocolConnectorHost;
	readonly calls: number;
} {
	return createHostProbe("connector") as {
		readonly host: IRpcProtocolConnectorHost;
		readonly calls: number;
	};
}

export function createAcceptorHostProbe(): {
	readonly host: IRpcProtocolAcceptorHost;
	readonly calls: number;
} {
	return createHostProbe("acceptor") as {
		readonly host: IRpcProtocolAcceptorHost;
		readonly calls: number;
	};
}

export function createSessionHostProbe(
	role: "connector",
	isActive: () => boolean,
): ProtocolHostProbe<IRpcProtocolConnectorHost>;
export function createSessionHostProbe(
	role: "acceptor",
	isActive: () => boolean,
): ProtocolHostProbe<IRpcProtocolAcceptorHost>;
export function createSessionHostProbe(
	role: "connector" | "acceptor",
	isActive: () => boolean,
): ProtocolHostProbe<IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost> {
	const ownerFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}> = [];
	const sessionFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}> = [];
	const transitions: RpcProtocolSessionTransition[] = [];
	const incomingFinishes: RpcIncomingTerminal[] = [];
	const probe = {
		session: undefined,
		disposition: {
			kind: RpcIncomingCallKindEnum.handler,
			outcome: { type: RpcCallTerminalTypeEnum.returnedVoid },
		},
		attachCount: 0,
		reservationCount: 0,
		commitCount: 0,
		handlerOutcomeReadCount: 0,
		lastRequest: undefined,
		incomingFinishes,
		transitions,
		ownerFaults,
		sessionFaults,
	} as Omit<
		ProtocolHostProbe<IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost>,
		"host"
	>;
	const sessionHost: IRpcProtocolSessionHost = {
		reserveIncomingCall(request, consume) {
			if (!isActive()) return false;
			probe.reservationCount += 1;
			probe.lastRequest = request;
			const disposition = probe.disposition;
			if (disposition.kind === "resource") {
				return false;
			}
			let committed = false;
			const call: IRpcProtocolIncomingCall = {
				finish(outcome) {
					if (isActive()) incomingFinishes.push(outcome);
				},
			};
			const commit = () => {
				assertRpcConformance(isActive(), "Protocol case work is sealed.");
				committed = true;
				probe.commitCount += 1;
				return call;
			};
			if (disposition.kind === RpcIncomingCallKindEnum.unknown) {
				consume({
					kind: RpcIncomingCallKindEnum.unknown,
					code: disposition.code,
					commit,
				});
				return true;
			}
			const handlerCall = Object.create(call, {
				handlerOutcome: {
					enumerable: true,
					get() {
						assertRpcConformance(
							committed,
							"Protocol read handlerOutcome before reservation commit.",
						);
						probe.handlerOutcomeReadCount += 1;
						return Promise.resolve(disposition.outcome);
					},
				},
			}) as IRpcProtocolIncomingHandlerCall;
			consume({
				kind: RpcIncomingCallKindEnum.handler,
				commit() {
					assertRpcConformance(isActive(), "Protocol case work is sealed.");
					committed = true;
					probe.commitCount += 1;
					return handlerCall;
				},
			});
			return true;
		},
		transition: (transition) => {
			if (isActive()) transitions.push(transition);
		},
		fault(reason, error) {
			if (!isActive()) return;
			sessionFaults.push({ reason, error });
			probe.session?.forceClose();
		},
	};
	const common: IRpcProtocolHost = {
		policy: CONFORMANCE_POLICY,
		reserveRetainedBytes: () => Object.freeze({ release() {} }),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault: (reason, error) => ownerFaults.push({ reason, error }),
	};
	const attach = (
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined => {
		if (!isActive()) return undefined;
		probe.attachCount += 1;
		probe.session = session;
		return sessionHost;
	};
	const host =
		role === "connector"
			? { ...common, attachSession: attach }
			: { ...common, admitSession: attach };
	return Object.assign(probe, { host });
}

export function createTrackedTransport(
	isActive: () => boolean,
): TrackedProtocolTransport {
	const connectorIngress = new Subject<Uint8Array>();
	const acceptorIngress = new Subject<Uint8Array>();
	let closed = false;
	const transport = {
		connectorSubscriptions: 0,
		acceptorSubscriptions: 0,
		connectorSends: 0,
		acceptorSends: 0,
		closeCount: 0,
		handoffViolation: false,
		connectorHandoff: false,
		acceptorHandoff: false,
	} as TrackedProtocolTransport;
	const createConnection = (
		direction: "connector" | "acceptor",
		ingress: Subject<Uint8Array>,
		remoteIngress: Subject<Uint8Array>,
	): IRpcConnection => ({
		message$: new Observable((subscriber) => {
			if (!isActive()) {
				subscriber.complete();
				return;
			}
			if (direction === "connector") {
				transport.connectorSubscriptions += 1;
			} else {
				transport.acceptorSubscriptions += 1;
			}
			return ingress.subscribe(subscriber);
		}),
		send(message) {
			const task = (async () => {
				// A Protocol cannot send after handing off its side of the Connection.
				const sentAfterHandoff =
					(direction === "connector" && transport.connectorHandoff) ||
					(direction === "acceptor" && transport.acceptorHandoff);
				if (sentAfterHandoff) {
					transport.handoffViolation = true;
				}
				if (closed || !isActive()) {
					throw new Error("Conformance Connection is closed.");
				}
				if (direction === "connector") {
					transport.connectorSends += 1;
				} else {
					transport.acceptorSends += 1;
				}
				remoteIngress.next(message.slice());
			})();
			void task.catch(() => undefined);
			return task;
		},
		async close() {
			transport.closeCount += 1;
			if (!closed) {
				closed = true;
				connectorIngress.complete();
				acceptorIngress.complete();
			}
		},
	});
	transport.connectorConnection = createConnection(
		"connector",
		connectorIngress,
		acceptorIngress,
	);
	transport.acceptorConnection = createConnection(
		"acceptor",
		acceptorIngress,
		connectorIngress,
	);
	return transport;
}

const CONFORMANCE_POLICY: IRpcProtocolRuntimePolicy = Object.freeze({
	maxSessions: 4,
	maxHandshakes: 2,
	maxPendingInvocationsPerSession: 4,
	maxRetainedBytesPerSession: 4_194_304,
	maxRetainedBytesTotal: 5_767_168,
	maxHandlersPerSession: 2,
	maxHandlersTotal: 4,
	ackDelayMs: 1,
	activityProbeIntervalMs: 1_000,
	silenceTimeoutMs: 2_000,
	sendProgressTimeoutMs: 1_000,
	bindingAttemptTimeoutMs: 1_000,
	recoveryGraceMs: 2_000,
	shutdownDeadlineMs: 1_000,
});

function createHostProbe(role: "connector" | "acceptor"): {
	readonly host: IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost;
	readonly calls: number;
} {
	let calls = 0;
	const common: IRpcProtocolHost = {
		policy: CONFORMANCE_POLICY,
		reserveRetainedBytes: () => {
			calls += 1;
			return Object.freeze({ release() {} });
		},
		normalizeApplicationValue: (value) => {
			calls += 1;
			return createSnapshot(value) as IRpcApplicationSnapshot;
		},
		normalizeApplicationArguments: (value) => {
			calls += 1;
			return createSnapshot(value) as IRpcApplicationArgumentsSnapshot;
		},
		applicationValuesEqual: (left, right) => {
			calls += 1;
			return left.value === right.value;
		},
		fault: () => {
			calls += 1;
		},
	};
	const observeAttachment = (): undefined => {
		calls += 1;
		return undefined;
	};
	const host =
		role === "connector"
			? { ...common, attachSession: observeAttachment }
			: { ...common, admitSession: observeAttachment };
	return {
		host,
		get calls() {
			return calls;
		},
	};
}

function createSnapshot(value: unknown): unknown {
	return Object.freeze({ value, weight: 1 });
}
