/**
 * @overview Black-box conformance cases for public RPC Protocol implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, Subject } from "rxjs";
import type { IRpcProtocolConformanceFixture } from "@/conformance/rpc-conformance.interface";
import type {
	RpcConformanceOptions,
	RpcProtocolConformanceCandidate,
} from "@/conformance/rpc-conformance.type";
import {
	assertRpcConformance,
	type IRpcConformanceCase,
	runRpcConformanceCases,
	waitFor,
	within,
} from "@/conformance/rpc-conformance.util";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcApplicationValue,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";
import {
	isCallable,
	isFiniteNumber,
	isNonNullObject,
} from "@/utils/type-guard.util";

/** Runs the stable Protocol conformance cases documented by `/conformance`. */
export function runRpcProtocolConformance(
	fixture: IRpcProtocolConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	return runRpcConformanceCases(
		[
			{
				caseId: "protocol.construction.connector-fresh-non-reentrant",
				run: async () => {
					const probe = createConnectorHostProbe();
					const first = fixture.protocol.connector(probe.host);
					const second = fixture.protocol.connector(probe.host);
					assertProtocolRole(first);
					assertProtocolRole(second);
					assertRpcConformance(
						first !== second,
						"Connector Protocol roles must be fresh.",
					);
					assertRpcConformance(
						probe.calls === 0,
						"Construction reentered its host.",
					);
					await Promise.resolve();
					assertRpcConformance(
						probe.calls === 0,
						"Construction queued host work.",
					);
				},
			},
			{
				caseId: "protocol.construction.acceptor-fresh-non-reentrant",
				run: async () => {
					const probe = createAcceptorHostProbe();
					const first = fixture.protocol.acceptor(probe.host);
					const second = fixture.protocol.acceptor(probe.host);
					assertProtocolRole(first);
					assertProtocolRole(second);
					assertRpcConformance(
						first !== second,
						"Acceptor Protocol roles must be fresh.",
					);
					assertRpcConformance(
						probe.calls === 0,
						"Construction reentered its host.",
					);
					await Promise.resolve();
					assertRpcConformance(
						probe.calls === 0,
						"Construction queued host work.",
					);
				},
			},
			{
				caseId: "protocol.handoff.subscribe-before-install",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					try {
						assertRpcConformance(
							pair.transport.connectorSubscriptions === 1 &&
								pair.transport.acceptorSubscriptions === 1,
							"Protocol roles did not synchronously subscribe exactly once.",
						);
						assertRpcConformance(
							!pair.transport.handoffViolation,
							"Protocol role performed binding work before the handoff barrier.",
						);
						assertRpcConformance(
							pair.connectorProbe.attachCount === 1 &&
								pair.acceptorProbe.attachCount === 1,
							"Fresh Session was not attached/admitted exactly once.",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			},
			{
				caseId: "protocol.values.normalized-snapshots",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					try {
						const resultValue = { answer: 42 };
						pair.acceptorProbe.disposition = {
							kind: RpcIncomingCallKindEnum.handler,
							outcome: {
								type: RpcCallTerminalTypeEnum.returned,
								value:
									pair.acceptorProbe.host.normalizeApplicationValue(
										resultValue,
									),
							},
						};
						const argument = { input: 41 };
						const args = pair.connectorProbe.host.normalizeApplicationArguments(
							[argument],
						);
						argument.input = 99;
						resultValue.answer = 99;
						const outcome = await invoke(pair.connectorSession, args);
						assertRpcConformance(
							pair.acceptorProbe.lastRequest?.args.value[0] !== argument,
							"Protocol exposed an original caller value.",
						);
						assertRpcConformance(
							readRecordNumber(
								pair.acceptorProbe.lastRequest?.args.value[0],
								"input",
							) === 41,
							"Detached argument snapshot changed.",
						);
						assertRpcConformance(
							outcome.type === RpcCallTerminalTypeEnum.returned &&
								readRecordNumber(outcome.value.value, "answer") === 42 &&
								Object.isFrozen(outcome.value.value),
							"Returned value was not a normalized snapshot.",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			},
			{
				caseId: "protocol.outgoing.reserve-commit-start-sink",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					try {
						pair.acceptorProbe.disposition = {
							kind: RpcIncomingCallKindEnum.handler,
							outcome: { type: RpcCallTerminalTypeEnum.returnedVoid },
						};
						const args = pair.connectorProbe.host.normalizeApplicationArguments(
							[],
						);
						const reservation = pair.connectorSession.reserveInvocation({
							service: "service",
							method: "method",
							args,
						});
						assertRpcConformance(
							reservation !== undefined,
							"Invocation was not reserved.",
						);
						const beforeCommit = pair.transport.connectorSends;
						const outcome: { value?: RpcCallOutcome } = {};
						const invocation = reservation.commit({
							finish: (value) => (outcome.value = value),
						});
						assertRpcConformance(
							pair.transport.connectorSends === beforeCommit &&
								Reflect.get(outcome, "value") === undefined,
							"Reservation commit sent or settled before start().",
						);
						invocation.start();
						await waitFor(
							() => outcome.value !== undefined,
							"Invocation outcome",
						);
						assertRpcConformance(
							outcome.value?.type === RpcCallTerminalTypeEnum.returnedVoid,
							"Sink did not receive the handler outcome.",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			},
			...createIncomingDispositionCases(fixture.protocol),
			{
				caseId: "protocol.fault.active-session-scope",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					try {
						const message = fixture.createActiveProtocolFaultMessage();
						assertRpcConformance(
							message.byteLength > 0,
							"Fault fixture returned an empty message.",
						);
						await pair.transport.connectorConnection.send(message);
						await waitFor(
							() => pair.acceptorProbe.sessionFaults.length > 0,
							"Active Session fault",
						);
						assertRpcConformance(
							pair.acceptorProbe.sessionFaults[0]?.reason ===
								RpcCloseReasonEnum.protocolFault &&
								pair.acceptorProbe.ownerFaults.length === 0,
							"Active grammar fault escaped the Session scope.",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			},
			{
				caseId: "protocol.counter.first-call-drains",
				run: async () => {
					const pair = await openProtocolPair(
						fixture.counterExhaustionProtocol,
					);
					try {
						const args = pair.connectorProbe.host.normalizeApplicationArguments(
							[],
						);
						const reservation = pair.connectorSession.reserveInvocation({
							service: "service",
							method: "method",
							args,
						});
						if (reservation !== undefined) {
							reservation.commit({ finish: () => undefined }).start();
						}
						await waitFor(
							() => pair.connectorProbe.transitions.some(isCounterDrain),
							"Counter drain",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			},
			{
				caseId: "protocol.termination.shutdown-phase",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					await within(pair.connector.shutdown(), "Protocol shutdown");
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"shutdown() fulfilled before Direct Close.",
					);
					pair.acceptor.close();
					await Promise.all([
						pair.connector.cleanup(),
						pair.acceptor.cleanup(),
					]);
				},
			},
			{
				caseId: "protocol.termination.close-phase",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					pair.connector.close();
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"close() did not synchronously invoke Direct Close.",
					);
					pair.acceptor.close();
					await Promise.all([
						pair.connector.cleanup(),
						pair.acceptor.cleanup(),
					]);
				},
			},
			{
				caseId: "protocol.termination.cleanup-cached",
				run: async () => {
					const protocol = fixture.protocol.connector(
						createConnectorHostProbe().host,
					);
					protocol.close();
					const first = protocol.cleanup();
					const second = protocol.cleanup();
					assertRpcConformance(
						first === second,
						"cleanup() did not return its cached task.",
					);
					await within(first, "Protocol cleanup");
				},
			},
		],
		options,
	);
}

type IncomingDisposition =
	| { readonly kind: "resource" }
	| {
			readonly kind: RpcIncomingCallKindEnum.unknown;
			readonly code: RpcUnknownCallFailure;
	  }
	| {
			readonly kind: RpcIncomingCallKindEnum.handler;
			readonly outcome: RpcHandlerOutcome;
	  };

interface ProtocolHostProbe<
	THost extends IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
> {
	readonly host: THost;
	session: IRpcProtocolSession | undefined;
	disposition: IncomingDisposition;
	attachCount: number;
	reservationCount: number;
	commitCount: number;
	releaseCount: number;
	handlerOutcomeReadCount: number;
	lastRequest:
		| {
				readonly service: string;
				readonly method: string;
				readonly args: IRpcApplicationArgumentsSnapshot;
		  }
		| undefined;
	readonly incomingFinishes: RpcIncomingTerminal[];
	readonly transitions: RpcProtocolSessionTransition[];
	readonly ownerFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}>;
	readonly sessionFaults: Array<{
		readonly reason: RpcProtocolFaultReason;
		readonly error: Error;
	}>;
}

interface TrackedProtocolTransport {
	connectorConnection: IRpcConnection;
	acceptorConnection: IRpcConnection;
	connectorSubscriptions: number;
	acceptorSubscriptions: number;
	connectorSends: number;
	acceptorSends: number;
	closeCount: number;
	handoffViolation: boolean;
	connectorHandoff: boolean;
	acceptorHandoff: boolean;
}

interface ProtocolPair {
	readonly connector: IRpcProtocolConnector;
	readonly acceptor: IRpcProtocolAcceptor;
	readonly connectorProbe: ProtocolHostProbe<IRpcProtocolConnectorHost>;
	readonly acceptorProbe: ProtocolHostProbe<IRpcProtocolAcceptorHost>;
	readonly connectorSession: IRpcProtocolSession;
	readonly transport: TrackedProtocolTransport;
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

function createConnectorHostProbe(): {
	readonly host: IRpcProtocolConnectorHost;
	readonly calls: number;
} {
	return createHostProbe("connector") as {
		readonly host: IRpcProtocolConnectorHost;
		readonly calls: number;
	};
}

function createAcceptorHostProbe(): {
	readonly host: IRpcProtocolAcceptorHost;
	readonly calls: number;
} {
	return createHostProbe("acceptor") as {
		readonly host: IRpcProtocolAcceptorHost;
		readonly calls: number;
	};
}

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

function assertProtocolRole(value: unknown): void {
	assertRpcConformance(
		isNonNullObject(value),
		"Protocol factory must return a role.",
	);
	for (const member of ["shutdown", "close", "cleanup"] as const) {
		assertRpcConformance(
			isCallable(Reflect.get(value as object, member)),
			`Protocol role is missing ${member}().`,
		);
	}
}

function createIncomingDispositionCases(
	protocol: RpcProtocolConformanceCandidate,
): IRpcConformanceCase[] {
	return [
		{
			caseId: "protocol.incoming.resource-disposition",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					pair.acceptorProbe.disposition = { kind: "resource" };
					const outcome = await invokeWithValues(pair, []);
					assertRpcConformance(
						outcome.type === RpcCallTerminalTypeEnum.failed &&
							outcome.code === RpcExceptionCodeEnum.unavailable,
						"Resource rejection did not finish unavailable.",
					);
					assertRpcConformance(
						pair.acceptorProbe.reservationCount === 1 &&
							pair.acceptorProbe.commitCount === 0 &&
							pair.acceptorProbe.handlerOutcomeReadCount === 0,
						"Resource rejection retained or committed incoming work.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		...(
			[
				RpcExceptionCodeEnum.unknownService,
				RpcExceptionCodeEnum.unknownMethod,
			] as const
		).map(
			(code): IRpcConformanceCase => ({
				caseId: `protocol.incoming.semantic-${code}`,
				async run() {
					const pair = await openProtocolPair(protocol);
					try {
						pair.acceptorProbe.disposition = {
							kind: RpcIncomingCallKindEnum.unknown,
							code,
						};
						const outcome = await invokeWithValues(pair, []);
						assertRpcConformance(
							outcome.type === RpcCallTerminalTypeEnum.failed &&
								outcome.code === code,
							`Semantic rejection did not finish ${code}.`,
						);
						assertRpcConformance(
							pair.acceptorProbe.commitCount === 1 &&
								pair.acceptorProbe.handlerOutcomeReadCount === 0,
							"Semantic rejection acquired a handler outcome.",
						);
					} finally {
						await closeProtocolPair(pair);
					}
				},
			}),
		),
		{
			caseId: "protocol.incoming.handler-dispositions-permit",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const returned = pair.acceptorProbe.host.normalizeApplicationValue(7);
					const expectations: ReadonlyArray<{
						readonly handler: RpcHandlerOutcome;
						readonly caller: RpcCallOutcome;
					}> = [
						{
							handler: { type: RpcCallTerminalTypeEnum.returnedVoid },
							caller: { type: RpcCallTerminalTypeEnum.returnedVoid },
						},
						{
							handler: {
								type: RpcCallTerminalTypeEnum.returned,
								value: returned,
							},
							caller: {
								type: RpcCallTerminalTypeEnum.returned,
								value: returned,
							},
						},
						{
							handler: {
								type: RpcCallTerminalTypeEnum.failed,
								code: RpcExceptionCodeEnum.handlerFailed,
							},
							caller: {
								type: RpcCallTerminalTypeEnum.failed,
								code: RpcExceptionCodeEnum.handlerFailed,
							},
						},
					];
					for (const expectation of expectations) {
						pair.acceptorProbe.disposition = {
							kind: RpcIncomingCallKindEnum.handler,
							outcome: expectation.handler,
						};
						const outcome = await invokeWithValues(pair, []);
						assertRpcConformance(
							outcomesEqual(outcome, expectation.caller),
							"Handler disposition changed at the outgoing sink.",
						);
					}
					assertRpcConformance(
						pair.acceptorProbe.commitCount === 3 &&
							pair.acceptorProbe.handlerOutcomeReadCount === 3,
						"Handler permit outcome was not owned exactly once per committed call.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
	];
}

async function openProtocolPair(
	protocol: RpcProtocolConformanceCandidate,
): Promise<ProtocolPair> {
	const connectorProbe = createSessionHostProbe("connector");
	const acceptorProbe = createSessionHostProbe("acceptor");
	const connector = protocol.connector(connectorProbe.host);
	const acceptor = protocol.acceptor(acceptorProbe.host);
	const transport = createTrackedTransport();
	const controller = new AbortController();

	transport.acceptorHandoff = true;
	const acceptance = acceptor.accept(
		transport.acceptorConnection,
		controller.signal,
	);
	transport.acceptorHandoff = false;
	assertRpcConformance(
		transport.acceptorSubscriptions === 1,
		"accept() did not subscribe synchronously.",
	);

	transport.connectorHandoff = true;
	const binding = connector.bind(
		transport.connectorConnection,
		controller.signal,
	);
	transport.connectorHandoff = false;
	assertRpcConformance(
		transport.connectorSubscriptions === 1,
		"bind() did not subscribe synchronously.",
	);

	await within(Promise.all([acceptance, binding]), "Protocol handoff");
	assertRpcConformance(
		connectorProbe.session !== undefined && acceptorProbe.session !== undefined,
		"Protocol handoff did not install both Sessions.",
	);
	return {
		connector,
		acceptor,
		connectorProbe,
		acceptorProbe,
		connectorSession: connectorProbe.session,
		transport,
	};
}

async function closeProtocolPair(pair: ProtocolPair): Promise<void> {
	pair.connector.close();
	pair.acceptor.close();
	await within(
		Promise.all([pair.connector.cleanup(), pair.acceptor.cleanup()]),
		"Protocol pair cleanup",
	);
}

function createSessionHostProbe(
	role: "connector",
): ProtocolHostProbe<IRpcProtocolConnectorHost>;
function createSessionHostProbe(
	role: "acceptor",
): ProtocolHostProbe<IRpcProtocolAcceptorHost>;
function createSessionHostProbe(
	role: "connector" | "acceptor",
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
		releaseCount: 0,
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
		reserveIncomingCall(request) {
			probe.reservationCount += 1;
			probe.lastRequest = request;
			const disposition = probe.disposition;
			if (disposition.kind === "resource") {
				return undefined;
			}
			let committed = false;
			const call: IRpcProtocolIncomingCall = {
				finish(outcome) {
					incomingFinishes.push(outcome);
				},
			};
			const reservation = {
				commit() {
					committed = true;
					probe.commitCount += 1;
					return call;
				},
				release() {
					probe.releaseCount += 1;
				},
			};
			if (disposition.kind === RpcIncomingCallKindEnum.unknown) {
				return {
					kind: RpcIncomingCallKindEnum.unknown,
					code: disposition.code,
					reservation,
				};
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
			return {
				kind: RpcIncomingCallKindEnum.handler,
				reservation: {
					...reservation,
					commit() {
						reservation.commit();
						return handlerCall;
					},
				},
			};
		},
		transition: (transition) => transitions.push(transition),
		fault(reason, error) {
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
	const attach = (session: IRpcProtocolSession): IRpcProtocolSessionHost => {
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

function createTrackedTransport(): TrackedProtocolTransport {
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
			if (direction === "connector") {
				transport.connectorSubscriptions += 1;
			} else {
				transport.acceptorSubscriptions += 1;
			}
			return ingress.subscribe(subscriber);
		}),
		async send(message) {
			// A Protocol cannot send after handing off its side of the Connection.
			const sentAfterHandoff =
				(direction === "connector" && transport.connectorHandoff) ||
				(direction === "acceptor" && transport.acceptorHandoff);
			if (sentAfterHandoff) {
				transport.handoffViolation = true;
			}
			if (closed) {
				throw new Error("Conformance Connection is closed.");
			}
			if (direction === "connector") {
				transport.connectorSends += 1;
			} else {
				transport.acceptorSends += 1;
			}
			remoteIngress.next(message.slice());
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

function invokeWithValues(
	pair: ProtocolPair,
	values: readonly RpcApplicationValue[],
): Promise<RpcCallOutcome> {
	return invoke(
		pair.connectorSession,
		pair.connectorProbe.host.normalizeApplicationArguments(values),
	);
}

async function invoke(
	session: IRpcProtocolSession,
	args: IRpcApplicationArgumentsSnapshot,
): Promise<RpcCallOutcome> {
	const reservation = session.reserveInvocation({
		service: "service",
		method: "method",
		args,
	});
	assertRpcConformance(
		reservation !== undefined,
		"Invocation capacity was unavailable.",
	);
	const { promise: outcome, resolve: finish } =
		Promise.withResolvers<RpcCallOutcome>();
	const invocation = reservation.commit({ finish });
	invocation.start();
	return within(outcome, "Invocation sink");
}

function outcomesEqual(left: RpcCallOutcome, right: RpcCallOutcome): boolean {
	if (left.type !== right.type) {
		return false;
	}
	// Returned outcomes compare their normalized Application Values.
	const bothReturned =
		left.type === RpcCallTerminalTypeEnum.returned &&
		right.type === RpcCallTerminalTypeEnum.returned;
	if (bothReturned) {
		return rpcApplicationValuesEqual(left.value, right.value);
	}
	// Failed outcomes compare their safe failure codes.
	const bothFailed =
		left.type === RpcCallTerminalTypeEnum.failed &&
		right.type === RpcCallTerminalTypeEnum.failed;
	if (bothFailed) {
		return left.code === right.code;
	}
	return true;
}

function readRecordNumber(value: unknown, key: string): number | undefined {
	if (!isNonNullObject(value)) {
		return undefined;
	}
	const member = Reflect.get(value, key) as unknown;
	return isFiniteNumber(member) ? member : undefined;
}

function isCounterDrain(transition: RpcProtocolSessionTransition): boolean {
	return (
		transition.type === RpcProtocolSessionTransitionTypeEnum.draining &&
		transition.reason === RpcCloseReasonEnum.counterExhaustion
	);
}
