/**
 * @overview Black-box conformance cases for public RPC Protocol implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Observable, Subject } from "rxjs";
import type { IRpcProtocolConformanceFixture } from "@/conformance/rpc-conformance.interface";
import type { RpcConformanceOptions } from "@/conformance/rpc-conformance.type";
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
	IRpcProtocol,
	IRpcProtocolAcceptorHost,
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorHost,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolHost,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolIncomingStream,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcProtocolSourceSink,
	IRpcProtocolStream,
	IRpcProtocolSubscriberSink,
	RpcApplicationValue,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingStreamTerminal,
	RpcIncomingTerminal,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcProtocolStreamRequest,
	RpcStreamOutcome,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "@/utils/rpc-application-value.util";

const CONFORMANCE_POLICY: IRpcProtocolRuntimePolicy = Object.freeze({
	maxSessions: 4,
	maxHandshakes: 2,
	maxApplicationWorkPerSession: 8,
	maxApplicationWorkTotal: 16,
	maxActiveStreamsPerSession: 4,
	maxActiveStreamsTotal: 8,
	maxRetainedBytesPerSession: 8_388_608,
	maxRetainedBytesTotal: 10_485_760,
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

/** Runs the stable Protocol conformance cases documented by `/conformance`. */
export function runRpcProtocolConformance(
	fixture: IRpcProtocolConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	return runRpcConformanceCases(
		[
			{
				caseId: "protocol.construction.immutable",
				run: () => {
					assertRpcConformance(
						Object.isFrozen(fixture.protocol),
						"Protocol must be immutable.",
					);
				},
			},
			{
				caseId: "protocol.construction.connector-fresh-non-reentrant",
				run: async () => {
					const probe = createConnectorHostProbe();
					const first = fixture.protocol.createConnector(probe.host);
					const second = fixture.protocol.createConnector(probe.host);
					assertRoleRuntime(first);
					assertRoleRuntime(second);
					assertRpcConformance(
						first !== second,
						"Connector runtimes must be fresh.",
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
					const first = fixture.protocol.createAcceptor(probe.host);
					const second = fixture.protocol.createAcceptor(probe.host);
					assertRoleRuntime(first);
					assertRoleRuntime(second);
					assertRpcConformance(
						first !== second,
						"Acceptor runtimes must be fresh.",
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
							"Runtime did not synchronously subscribe exactly once.",
						);
						assertRpcConformance(
							!pair.transport.handoffViolation,
							"Runtime performed binding work before the handoff barrier.",
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
					await within(pair.connectorRuntime.shutdown(), "Protocol shutdown");
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"shutdown() fulfilled before Direct Close.",
					);
					pair.acceptorRuntime.close();
					await Promise.all([
						pair.connectorRuntime.cleanup(),
						pair.acceptorRuntime.cleanup(),
					]);
				},
			},
			{
				caseId: "protocol.termination.close-phase",
				run: async () => {
					const pair = await openProtocolPair(fixture.protocol);
					pair.connectorRuntime.close();
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"close() did not synchronously invoke Direct Close.",
					);
					pair.acceptorRuntime.close();
					await Promise.all([
						pair.connectorRuntime.cleanup(),
						pair.acceptorRuntime.cleanup(),
					]);
				},
			},
			{
				caseId: "protocol.termination.cleanup-cached",
				run: async () => {
					const runtime = fixture.protocol.createConnector(
						createConnectorHostProbe().host,
					);
					runtime.close();
					const first = runtime.cleanup();
					const second = runtime.cleanup();
					assertRpcConformance(
						first === second,
						"cleanup() did not return its cached task.",
					);
					await within(first, "Protocol cleanup");
				},
			},
			...createStreamConformanceCases(fixture.protocol),
		],
		options,
	);
}

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

function assertRoleRuntime(value: unknown): void {
	assertRpcConformance(
		typeof value === "object" && value !== null,
		"Protocol factory must return a runtime.",
	);
	for (const member of ["shutdown", "close", "cleanup"] as const) {
		assertRpcConformance(
			typeof Reflect.get(value, member) === "function",
			`Protocol runtime is missing ${member}().`,
		);
	}
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

type IncomingStreamDisposition =
	| { readonly kind: "resource" }
	| { readonly kind: "source" }
	| {
			readonly kind: "unknown";
			readonly code:
				| RpcExceptionCodeEnum.unknownService
				| RpcExceptionCodeEnum.unknownMember;
	  };

interface ProtocolHostProbe<
	THost extends IRpcProtocolConnectorHost | IRpcProtocolAcceptorHost,
> {
	readonly host: THost;
	session: IRpcProtocolSession | undefined;
	disposition: IncomingDisposition;
	streamDisposition: IncomingStreamDisposition;
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
	readonly incomingStreamFinishes: RpcIncomingStreamTerminal[];
	readonly incomingStreamRequests: RpcProtocolStreamRequest[];
	readonly sourceSinks: IRpcProtocolSourceSink[];
	streamCommitCount: number;
	streamReleaseCount: number;
	deferSourceRelease: boolean;
	releaseSource(): void;
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
	maxConnectorUnsettledSends: number;
	maxAcceptorUnsettledSends: number;
	readonly connectorMessages: Uint8Array[];
	readonly acceptorMessages: Uint8Array[];
	closeCount: number;
	handoffViolation: boolean;
	connectorHandoff: boolean;
	acceptorHandoff: boolean;
	fail(error: Error): void;
	replayLastAcceptorMessage(): void;
}

interface ProtocolPair {
	readonly connectorRuntime: IRpcProtocolConnectorRuntime;
	readonly acceptorRuntime: IRpcProtocolAcceptorRuntime;
	readonly connectorProbe: ProtocolHostProbe<IRpcProtocolConnectorHost>;
	readonly acceptorProbe: ProtocolHostProbe<IRpcProtocolAcceptorHost>;
	readonly connectorSession: IRpcProtocolSession;
	readonly acceptorSession: IRpcProtocolSession;
	transport: TrackedProtocolTransport;
}

function createIncomingDispositionCases(
	protocol: IRpcProtocol,
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

function createStreamConformanceCases(
	protocol: IRpcProtocol,
): IRpcConformanceCase[] {
	return [
		{
			caseId: "protocol.stream.outgoing-lifecycle",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const observation = createSubscriberObservation();
					const stream = reserveStream(pair, observation.sink);
					assertRpcConformance(
						pair.acceptorProbe.incomingStreamRequests.length === 0,
						"Stream commit performed remote work before start().",
					);
					stream.start();
					await waitFor(
						() => pair.acceptorProbe.sourceSinks.length === 1,
						"Incoming Source admission",
					);
					stream.cancel();
					await waitFor(
						() =>
							observation.terminals.some(
								(outcome) => outcome.type === "canceled",
							),
						"Canceled stream terminal",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		{
			caseId: "protocol.stream.incoming-resource-before-route",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					pair.acceptorProbe.streamDisposition = { kind: "resource" };
					const observation = createSubscriberObservation();
					reserveStream(pair, observation.sink).start();
					await waitFor(
						() => observation.terminals.length === 1,
						"Resource stream terminal",
					);
					assertRpcConformance(
						observation.terminals[0]?.type === "failed" &&
							observation.terminals[0].code ===
								RpcExceptionCodeEnum.unavailable &&
							pair.acceptorProbe.streamCommitCount === 0,
						"Incoming resource rejection acquired a Source.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		{
			caseId: "protocol.stream.incoming-semantic-unknown-member",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					pair.acceptorProbe.streamDisposition = {
						kind: "unknown",
						code: RpcExceptionCodeEnum.unknownMember,
					};
					const observation = createSubscriberObservation();
					reserveStream(pair, observation.sink).start();
					await waitFor(
						() => observation.terminals.length === 1,
						"Unknown-member stream terminal",
					);
					assertRpcConformance(
						observation.terminals[0]?.type === "failed" &&
							observation.terminals[0].code ===
								RpcExceptionCodeEnum.unknownMember &&
							pair.acceptorProbe.sourceSinks.length === 0,
						"Unknown stream route acquired a Source.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		...createStreamDeliveryCases(protocol),
		...createStreamConvergenceCases(protocol),
	];
}

function createStreamDeliveryCases(
	protocol: IRpcProtocol,
): IRpcConformanceCase[] {
	return [
		{
			caseId: "protocol.stream.projection-rearm",
			run: () => runProjectionRearmCase(protocol),
		},
		{
			caseId: "protocol.stream.source-reserve-before-raw",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const observation = createSubscriberObservation();
					reserveStream(pair, observation.sink).start();
					const source = await waitForSource(pair);
					const emission = source.reserveEmission();
					assertRpcConformance(
						emission !== undefined,
						"Source emission position was unavailable at initial W=1 credit.",
					);
					const snapshot = pair.acceptorProbe.host.normalizeApplicationValue(
						"reserved-before-normalization",
					);
					emission.commit(snapshot);
					await waitFor(
						() => observation.items.length === 1,
						"Reserved Source item",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		{
			caseId: "protocol.stream.source-w1-overflow",
			run: () => runW1OverflowCase(protocol, false),
		},
		{
			caseId: "protocol.stream.item-before-terminal",
			run: () => runW1OverflowCase(protocol, true),
		},
		{
			caseId: "protocol.stream.over-credit-session-fault",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const observation = createSubscriberObservation("closed");
					reserveStream(pair, observation.sink).start();
					const source = await waitForSource(pair);
					const emission = source.reserveEmission();
					assertRpcConformance(
						emission !== undefined,
						"Initial emission missing.",
					);
					emission.commit(
						pair.acceptorProbe.host.normalizeApplicationValue("one"),
					);
					await waitFor(
						() => observation.items.length === 1,
						"First stream item",
					);
					pair.transport.replayLastAcceptorMessage();
					await waitFor(
						() => pair.connectorProbe.sessionFaults.length === 1,
						"Over-credit Session fault",
					);
					assertRpcConformance(
						pair.connectorProbe.sessionFaults[0]?.reason ===
							RpcCloseReasonEnum.protocolFault,
						"Over-credit input did not fault the current Session.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
	];
}

function createStreamConvergenceCases(
	protocol: IRpcProtocol,
): IRpcConformanceCase[] {
	return [
		{
			caseId: "protocol.stream.terminal-teardown-release",
			run: () => runReleaseReceiptCase(protocol),
		},
		{
			caseId: "protocol.stream.recovery-no-resubscribe",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const observation = createSubscriberObservation();
					reserveStream(pair, observation.sink).start();
					const source = await waitForSource(pair);
					const first = source.reserveEmission();
					assertRpcConformance(
						first !== undefined,
						"Pre-Recovery emission was unavailable.",
					);
					first.commit(
						pair.acceptorProbe.host.normalizeApplicationValue("retained-first"),
					);
					await waitFor(
						() => observation.items.length === 1,
						"Pre-Recovery stream item",
					);
					let retainedEmission: ReturnType<
						IRpcProtocolSourceSink["reserveEmission"]
					>;
					await waitFor(() => {
						retainedEmission ??= source.reserveEmission();
						return retainedEmission !== undefined;
					}, "Retained Source emission position");
					pair.transport.fail(new Error("Conformance binding loss."));
					await waitFor(
						() => pair.connectorProbe.transitions.some(isRecovering),
						"Recovering transition",
					);
					await replaceProtocolPairConnection(pair);
					assertRpcConformance(
						pair.acceptorProbe.streamCommitCount === 1 &&
							pair.acceptorProbe.sourceSinks.length === 1 &&
							observation.items.length === 1,
						"Recovery reacquired or resubscribed the Source.",
					);
					retainedEmission?.commit(
						pair.acceptorProbe.host.normalizeApplicationValue(
							"retained-second",
						),
					);
					await waitFor(
						() => observation.items.length === 2,
						"Post-Recovery retained Source item",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		{
			caseId: "protocol.stream.fairness-progress",
			async run() {
				const pair = await openProtocolPair(protocol);
				try {
					const observations = Array.from({ length: 4 }, () =>
						createSubscriberObservation(),
					);
					for (const [index, observation] of observations.entries()) {
						reserveStream(pair, observation.sink, `stream-${index}`).start();
					}
					await waitFor(
						() => pair.acceptorProbe.sourceSinks.length === 4,
						"Four ready stream Sources",
					);
					for (let round = 0; round < 8; round += 1) {
						for (const [
							index,
							source,
						] of pair.acceptorProbe.sourceSinks.entries()) {
							const emission = source.reserveEmission();
							assertRpcConformance(
								emission !== undefined,
								"Continuously ready stream starved.",
							);
							emission.commit(
								pair.acceptorProbe.host.normalizeApplicationValue(
									`item-${round}-${index}`,
								),
							);
						}
						await invokeWithValues(pair, [round]);
						await waitFor(
							() =>
								observations.every(({ items }) => items.length === round + 1),
							`Fair stream progress round ${round + 1}`,
						);
						await Promise.resolve();
						await Promise.resolve();
					}
					assertRpcConformance(
						observations.every(({ items }) => items.length === 8),
						"A ready stream missed a sustained fairness round.",
					);
				} finally {
					await closeProtocolPair(pair);
				}
			},
		},
		{
			caseId: "protocol.stream.shutdown-graceful-force",
			async run() {
				const pair = await openProtocolPair(protocol);
				const observation = createSubscriberObservation();
				reserveStream(pair, observation.sink).start();
				await waitForSource(pair);
				const shutdown = pair.connectorRuntime.shutdown();
				await Promise.resolve();
				assertRpcConformance(
					observation.terminals.length === 0,
					"Graceful shutdown fabricated a stream terminal.",
				);
				pair.connectorRuntime.close();
				await waitFor(
					() => observation.terminals.length === 1,
					"Forced stream terminal",
				);
				pair.acceptorRuntime.close();
				await Promise.all([
					shutdown,
					pair.connectorRuntime.cleanup(),
					pair.acceptorRuntime.cleanup(),
				]);
			},
		},
		{
			caseId: "protocol.stream.aggregate-bounded-load",
			run: () => runAggregateLoadCase(protocol, false),
		},
		{
			caseId: "protocol.receipt.terminal-direction-only",
			run: () => runTerminalDirectionCase(protocol),
		},
		{
			caseId: "protocol.stream.adapter-rejection-is-binding-failure",
			run: () => runAggregateLoadCase(protocol, true),
		},
	];
}

interface SubscriberObservation {
	readonly sink: IRpcProtocolSubscriberSink;
	readonly items: IRpcApplicationSnapshot[];
	readonly terminals: RpcStreamOutcome[];
}

function createSubscriberObservation(
	itemEffect: "rearm" | "closed" = "rearm",
): SubscriberObservation {
	const items: IRpcApplicationSnapshot[] = [];
	const terminals: RpcStreamOutcome[] = [];
	return {
		items,
		terminals,
		sink: {
			reserveItem(snapshot) {
				return {
					commit() {
						items.push(snapshot);
						return itemEffect;
					},
				};
			},
			reserveTerminal(outcome) {
				return {
					commit() {
						terminals.push(outcome);
					},
				};
			},
		},
	};
}

function reserveStream(
	pair: ProtocolPair,
	sink: IRpcProtocolSubscriberSink,
	member = "events",
): IRpcProtocolStream {
	return reserveStreamFor(
		pair.connectorSession,
		pair.connectorProbe.host,
		sink,
		member,
	);
}

function reserveStreamFor(
	session: IRpcProtocolSession,
	host: IRpcProtocolHost,
	sink: IRpcProtocolSubscriberSink,
	member: string,
): IRpcProtocolStream {
	const args = host.normalizeApplicationArguments([]);
	const reservation = session.reserveStream({
		service: "service",
		member,
		kind: "stream-method",
		args,
	});
	assertRpcConformance(reservation !== undefined, "Stream was not reserved.");
	return reservation.commit(sink);
}

async function waitForSource(
	pair: ProtocolPair,
): Promise<IRpcProtocolSourceSink> {
	await waitFor(
		() => pair.acceptorProbe.sourceSinks.length > 0,
		"Incoming Source sink",
	);
	const source = pair.acceptorProbe.sourceSinks.at(-1);
	assertRpcConformance(
		source !== undefined,
		"Incoming Source sink was missing.",
	);
	return source;
}

async function runProjectionRearmCase(protocol: IRpcProtocol): Promise<void> {
	const pair = await openProtocolPair(protocol);
	try {
		const observation = createSubscriberObservation();
		reserveStream(pair, observation.sink).start();
		const source = await waitForSource(pair);
		const first = source.reserveEmission();
		assertRpcConformance(
			first !== undefined,
			"Initial emission was unavailable.",
		);
		first.commit(pair.acceptorProbe.host.normalizeApplicationValue("first"));
		await waitFor(() => observation.items.length === 1, "First stream item");
		let rearmedEmission: ReturnType<IRpcProtocolSourceSink["reserveEmission"]>;
		await waitFor(() => {
			rearmedEmission ??= source.reserveEmission();
			return rearmedEmission !== undefined;
		}, "Re-armed Source emission");
		rearmedEmission?.commit(
			pair.acceptorProbe.host.normalizeApplicationValue("second"),
		);
		await waitFor(() => observation.items.length === 2, "Second stream item");
	} finally {
		await closeProtocolPair(pair);
	}
}

async function runW1OverflowCase(
	protocol: IRpcProtocol,
	assertOrdering: boolean,
): Promise<void> {
	const pair = await openProtocolPair(protocol);
	try {
		const trace: string[] = [];
		const observation = createSubscriberObservation();
		const sink: IRpcProtocolSubscriberSink = {
			reserveItem(snapshot) {
				trace.push("item-reserved");
				const projection = observation.sink.reserveItem(snapshot);
				return {
					commit() {
						trace.push("item-effect");
						return projection.commit();
					},
				};
			},
			reserveTerminal(outcome) {
				trace.push("terminal-reserved");
				const projection = observation.sink.reserveTerminal(outcome);
				return {
					commit() {
						trace.push("terminal-effect");
						projection.commit();
					},
				};
			},
		};
		reserveStream(pair, sink).start();
		const source = await waitForSource(pair);
		const first = source.reserveEmission();
		assertRpcConformance(
			first !== undefined,
			"Initial emission was unavailable.",
		);
		first.commit(pair.acceptorProbe.host.normalizeApplicationValue("first"));
		const second = source.reserveEmission();
		assertRpcConformance(
			second === undefined,
			"W=1 admitted a second emission before re-arm.",
		);
		await waitFor(
			() => observation.terminals.length === 1,
			"Overflow stream terminal",
		);
		assertRpcConformance(
			observation.terminals[0]?.type === "failed" &&
				observation.terminals[0].code === RpcExceptionCodeEnum.overflow,
			"W=1 overflow selected the wrong terminal.",
		);
		if (assertOrdering) {
			assertRpcConformance(
				trace.join(",") ===
					"item-reserved,item-effect,terminal-reserved,terminal-effect",
				"Stream terminal overtook an earlier item effect.",
			);
		}
	} finally {
		await closeProtocolPair(pair);
	}
}

async function runReleaseReceiptCase(protocol: IRpcProtocol): Promise<void> {
	const pair = await openProtocolPair(protocol);
	try {
		pair.acceptorProbe.deferSourceRelease = true;
		const observation = createSubscriberObservation();
		reserveStream(pair, observation.sink).start();
		const source = await waitForSource(pair);
		source.finish({ type: "completed" });
		await waitFor(
			() => pair.acceptorProbe.incomingStreamFinishes.length === 1,
			"Incoming Source finish",
		);
		assertRpcConformance(
			pair.acceptorProbe.streamReleaseCount === 0,
			"Protocol retired Source ownership before teardown settlement.",
		);
		const shutdown = pair.acceptorRuntime.shutdown();
		const shutdownSettled = await Promise.race([
			shutdown.then(() => true),
			new Promise<false>((resolve) => setTimeout(() => resolve(false), 0)),
		]);
		assertRpcConformance(
			!shutdownSettled,
			"Graceful drain ignored unreleased Source ownership.",
		);
		pair.acceptorProbe.releaseSource();
		await waitFor(
			() => pair.acceptorProbe.streamReleaseCount === 1,
			"Source release receipt",
		);
		await within(shutdown, "Source release drain");
	} finally {
		await closeProtocolPair(pair);
	}
}

async function runTerminalDirectionCase(protocol: IRpcProtocol): Promise<void> {
	const pair = await openProtocolPair(protocol);
	try {
		const forwardObservation = createSubscriberObservation();
		const reverseObservation = createSubscriberObservation();
		reserveStream(pair, forwardObservation.sink, "forward").start();
		const reverseStream = reserveStreamFor(
			pair.acceptorSession,
			pair.acceptorProbe.host,
			reverseObservation.sink,
			"reverse",
		);
		reverseStream.start();
		await waitFor(
			() =>
				pair.acceptorProbe.sourceSinks.length === 1 &&
				pair.connectorProbe.sourceSinks.length === 1,
			"Bidirectional stream roots",
		);
		const sendsBeforeTerminal = pair.transport.connectorSends;
		pair.acceptorProbe.sourceSinks[0]?.finish({ type: "completed" });
		await waitFor(
			() => forwardObservation.terminals.length === 1,
			"Forward stream terminal",
		);
		await waitFor(
			() => pair.transport.connectorSends > sendsBeforeTerminal,
			"Forward terminal ACK",
		);
		const shutdown = pair.acceptorRuntime.shutdown();
		const shutdownSettled = await Promise.race([
			shutdown.then(() => true),
			new Promise<false>((resolve) => setTimeout(() => resolve(false), 0)),
		]);
		assertRpcConformance(
			!shutdownSettled,
			"One-direction terminal ACK retired reverse stream evidence.",
		);
		reverseStream.cancel();
		await waitFor(
			() => reverseObservation.terminals.length === 1,
			"Reverse stream terminal",
		);
		await within(shutdown, "Bidirectional terminal drain");
	} finally {
		await closeProtocolPair(pair);
	}
}

async function runAggregateLoadCase(
	protocol: IRpcProtocol,
	assertFailureOwner: boolean,
): Promise<void> {
	const pair = await openProtocolPair(protocol, 8);
	try {
		const boundedTransport = pair.transport;
		const observations = [
			createSubscriberObservation(),
			createSubscriberObservation(),
		];
		for (const [index, observation] of observations.entries()) {
			reserveStream(pair, observation.sink, `stream-${index}`).start();
		}
		await waitFor(
			() => pair.acceptorProbe.sourceSinks.length === 2,
			"Aggregate stream starts",
		);
		pair.acceptorProbe.sourceSinks[0]?.finish({ type: "completed" });
		for (let index = 0; index < 3; index += 1) {
			await invokeWithValues(pair, [index]);
		}
		void invokeWithValues(pair, [3]).catch(() => undefined);
		await waitFor(
			() => pair.connectorProbe.transitions.some(isRecovering),
			"Adapter rejection Recovery",
		);
		await replaceProtocolPairConnection(pair);
		await invokeWithValues(pair, ["post-recovery"]);
		assertRpcConformance(
			boundedTransport.maxConnectorUnsettledSends <= 1 &&
				boundedTransport.maxAcceptorUnsettledSends <= 1 &&
				pair.transport.maxConnectorUnsettledSends <= 1 &&
				pair.transport.maxAcceptorUnsettledSends <= 1,
			"Protocol allowed more than one unsettled complete-message send per direction.",
		);
		if (assertFailureOwner) {
			assertRpcConformance(
				observations.every((observation) =>
					observation.terminals.every(
						(outcome) =>
							outcome.type !== "failed" ||
							outcome.code !== RpcExceptionCodeEnum.overflow,
					),
				),
				"Adapter send rejection was projected as Stream Overflow.",
			);
		}
	} finally {
		await closeProtocolPair(pair);
	}
}

async function openProtocolPair(
	protocol: IRpcProtocol,
	rejectConnectorSendAt?: number,
): Promise<ProtocolPair> {
	const connectorProbe = createSessionHostProbe("connector");
	const acceptorProbe = createSessionHostProbe("acceptor");
	const connectorRuntime = protocol.createConnector(connectorProbe.host);
	const acceptorRuntime = protocol.createAcceptor(acceptorProbe.host);
	const transport = createTrackedTransport(rejectConnectorSendAt);
	const controller = new AbortController();

	transport.acceptorHandoff = true;
	const acceptance = acceptorRuntime.accept(
		transport.acceptorConnection,
		controller.signal,
	);
	transport.acceptorHandoff = false;
	assertRpcConformance(
		transport.acceptorSubscriptions === 1,
		"accept() did not subscribe synchronously.",
	);

	transport.connectorHandoff = true;
	const binding = connectorRuntime.bind(
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
		connectorRuntime,
		acceptorRuntime,
		connectorProbe,
		acceptorProbe,
		connectorSession: connectorProbe.session,
		acceptorSession: acceptorProbe.session,
		transport,
	};
}

async function replaceProtocolPairConnection(
	pair: ProtocolPair,
): Promise<void> {
	const transport = createTrackedTransport();
	const controller = new AbortController();
	transport.acceptorHandoff = true;
	const acceptance = pair.acceptorRuntime.accept(
		transport.acceptorConnection,
		controller.signal,
	);
	transport.acceptorHandoff = false;
	transport.connectorHandoff = true;
	const binding = pair.connectorRuntime.bind(
		transport.connectorConnection,
		controller.signal,
	);
	transport.connectorHandoff = false;
	await within(Promise.all([acceptance, binding]), "Protocol Recovery handoff");
	pair.transport = transport;
}

async function closeProtocolPair(pair: ProtocolPair): Promise<void> {
	pair.connectorRuntime.close();
	pair.acceptorRuntime.close();
	await within(
		Promise.all([
			pair.connectorRuntime.cleanup(),
			pair.acceptorRuntime.cleanup(),
		]),
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
	const incomingStreamFinishes: RpcIncomingStreamTerminal[] = [];
	const incomingStreamRequests: RpcProtocolStreamRequest[] = [];
	const sourceSinks: IRpcProtocolSourceSink[] = [];
	let pendingSourceRelease: (() => void) | undefined;
	const probe = {
		session: undefined,
		disposition: {
			kind: RpcIncomingCallKindEnum.handler,
			outcome: { type: RpcCallTerminalTypeEnum.returnedVoid },
		},
		streamDisposition: { kind: "source" },
		attachCount: 0,
		reservationCount: 0,
		commitCount: 0,
		releaseCount: 0,
		handlerOutcomeReadCount: 0,
		streamCommitCount: 0,
		streamReleaseCount: 0,
		deferSourceRelease: false,
		lastRequest: undefined,
		incomingFinishes,
		incomingStreamFinishes,
		incomingStreamRequests,
		sourceSinks,
		transitions,
		ownerFaults,
		sessionFaults,
		releaseSource() {
			pendingSourceRelease?.();
			pendingSourceRelease = undefined;
		},
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
		reserveIncomingStream(request) {
			incomingStreamRequests.push(request);
			const disposition = probe.streamDisposition;
			if (disposition.kind === "resource") {
				return undefined;
			}
			let state: "reserved" | "committed" | "released" = "reserved";
			const createControl = (): IRpcProtocolIncomingStream => ({
				finish(outcome, onReleased) {
					incomingStreamFinishes.push(outcome);
					const release = (): void => {
						probe.streamReleaseCount += 1;
						onReleased();
					};
					if (probe.deferSourceRelease) {
						pendingSourceRelease = release;
					} else {
						release();
					}
				},
			});
			const release = (): void => {
				if (state !== "reserved") {
					return;
				}
				state = "released";
				probe.streamReleaseCount += 1;
			};
			if (disposition.kind === "unknown") {
				return {
					kind: "unknown",
					code: disposition.code,
					reservation: {
						commit() {
							state = "committed";
							probe.streamCommitCount += 1;
							return createControl();
						},
						release,
					},
				};
			}
			return {
				kind: "source",
				reservation: {
					commit(source) {
						state = "committed";
						probe.streamCommitCount += 1;
						sourceSinks.push(source);
						return createControl();
					},
					release,
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

function createTrackedTransport(
	rejectConnectorSendAt?: number,
): TrackedProtocolTransport {
	const connectorIngress = new Subject<Uint8Array>();
	const acceptorIngress = new Subject<Uint8Array>();
	let closed = false;
	let connectorUnsettledSends = 0;
	let acceptorUnsettledSends = 0;
	const transport = {
		connectorSubscriptions: 0,
		acceptorSubscriptions: 0,
		connectorSends: 0,
		acceptorSends: 0,
		maxConnectorUnsettledSends: 0,
		maxAcceptorUnsettledSends: 0,
		connectorMessages: [],
		acceptorMessages: [],
		closeCount: 0,
		handoffViolation: false,
		connectorHandoff: false,
		acceptorHandoff: false,
		fail(error: Error) {
			if (closed) {
				return;
			}
			closed = true;
			connectorIngress.error(error);
			acceptorIngress.error(error);
		},
		replayLastAcceptorMessage() {
			const message = transport.acceptorMessages.at(-1);
			if (message !== undefined && !closed) {
				connectorIngress.next(message.slice());
			}
		},
	} as unknown as TrackedProtocolTransport;
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
			if (direction === "connector") {
				connectorUnsettledSends += 1;
				transport.maxConnectorUnsettledSends = Math.max(
					transport.maxConnectorUnsettledSends,
					connectorUnsettledSends,
				);
			} else {
				acceptorUnsettledSends += 1;
				transport.maxAcceptorUnsettledSends = Math.max(
					transport.maxAcceptorUnsettledSends,
					acceptorUnsettledSends,
				);
			}
			try {
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
					transport.connectorMessages.push(message.slice());
					if (transport.connectorSends === rejectConnectorSendAt) {
						const error = new Error(
							"Conformance Connection rejected the bounded send.",
						);
						transport.fail(error);
						throw error;
					}
				} else {
					transport.acceptorSends += 1;
					transport.acceptorMessages.push(message.slice());
				}
				await Promise.resolve();
				if (closed) {
					throw new Error(
						"Conformance Connection closed before Local Admission.",
					);
				}
				remoteIngress.next(message.slice());
			} finally {
				if (direction === "connector") {
					connectorUnsettledSends -= 1;
				} else {
					acceptorUnsettledSends -= 1;
				}
			}
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
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	const member = Reflect.get(value, key);
	return typeof member === "number" ? member : undefined;
}

function isCounterDrain(transition: RpcProtocolSessionTransition): boolean {
	return (
		transition.type === RpcProtocolSessionTransitionTypeEnum.draining &&
		transition.reason === RpcCloseReasonEnum.counterExhaustion
	);
}

function isRecovering(transition: RpcProtocolSessionTransition): boolean {
	return transition.type === RpcProtocolSessionTransitionTypeEnum.recovering;
}
