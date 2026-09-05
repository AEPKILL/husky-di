/**
 * @overview Black-box conformance cases for public RPC Protocol implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createRpcProtocolCaseLifetime } from "@/conformance/factories/rpc-protocol-case-lifetime.factory";
import type { IRpcProtocolCaseScope } from "@/conformance/interfaces/rpc-protocol-case-lifetime.interface";
import type { IRpcProtocolConformanceFixture } from "@/conformance/rpc-conformance.interface";
import type {
	RpcConformanceOptions,
	RpcProtocolConformanceCandidate,
} from "@/conformance/rpc-conformance.type";
import {
	assertRpcConformance,
	type IRpcConformanceCase,
	runRpcConformanceCases,
} from "@/conformance/rpc-conformance.util";
import {
	createAcceptorHostProbe,
	createConnectorHostProbe,
} from "@/conformance/rpc-protocol-case.util";
import type { ProtocolPair } from "@/conformance/types/rpc-protocol-case.type";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolSession,
	RpcApplicationValue,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolSessionTransition,
} from "@/interfaces/protocol/rpc-protocol.interface";
import { rpcApplicationValuesEqual } from "@/utils/rpc-application-value.util";
import { isFiniteNumber, isNonNullObject } from "@/utils/type-guard.util";

/** Runs the stable Protocol conformance cases documented by `/conformance`. */
export function runRpcProtocolConformance(
	fixture: IRpcProtocolConformanceFixture,
	options?: RpcConformanceOptions,
): Promise<void> {
	return runProtocolCases(
		fixture.protocol,
		[
			{
				caseId: "protocol.construction.connector-fresh-non-reentrant",
				run: async (scope) => {
					const probe = createConnectorHostProbe();
					const first = scope.createRole("connector", probe.host);
					const second = scope.createRole("connector", probe.host);
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
				run: async (scope) => {
					const probe = createAcceptorHostProbe();
					const first = scope.createRole("acceptor", probe.host);
					const second = scope.createRole("acceptor", probe.host);
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
				run: async (scope) => {
					const pair = await scope.openPair();
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
				},
			},
			{
				caseId: "protocol.values.normalized-snapshots",
				run: async (scope) => {
					const pair = await scope.openPair();
					const resultValue = { answer: 42 };
					pair.acceptorProbe.disposition = {
						kind: RpcIncomingCallKindEnum.handler,
						outcome: {
							type: RpcCallTerminalTypeEnum.returned,
							value:
								pair.acceptorProbe.host.normalizeApplicationValue(resultValue),
						},
					};
					const argument = { input: 41 };
					const args = pair.connectorProbe.host.normalizeApplicationArguments([
						argument,
					]);
					argument.input = 99;
					resultValue.answer = 99;
					const outcome = await invoke(scope, pair.connectorSession, args);
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
				},
			},
			{
				caseId: "protocol.outgoing.prepare-start-finish",
				run: async (scope) => {
					const pair = await scope.openPair();
					pair.acceptorProbe.disposition = {
						kind: RpcIncomingCallKindEnum.handler,
						outcome: { type: RpcCallTerminalTypeEnum.returnedVoid },
					};
					const args = pair.connectorProbe.host.normalizeApplicationArguments(
						[],
					);
					const outcomes: RpcCallOutcome[] = [];
					const sendsBeforePrepare = pair.transport.connectorSends;
					const invocation = pair.connectorSession.prepareInvocation(
						{
							service: "service",
							method: "method",
							args,
						},
						(value) => outcomes.push(value),
					);
					assertRpcConformance(
						invocation !== undefined,
						"Invocation was not prepared.",
					);
					assertRpcConformance(
						pair.transport.connectorSends === sendsBeforePrepare &&
							outcomes.length <= 1,
						"Preparation sent or finished more than once before start().",
					);
					if (outcomes.length === 0) {
						invocation.start();
					}
					await scope.waitFor(() => outcomes.length > 0, "Invocation outcome");
					assertRpcConformance(
						outcomes.length === 1 &&
							outcomes[0]?.type === RpcCallTerminalTypeEnum.returnedVoid,
						"Finish callback did not receive the handler outcome.",
					);
				},
			},
			{
				caseId: "protocol.outgoing.cancel-before-start-definite-non-execution",
				run: async (scope) => {
					const pair = await scope.openPair();
					const args = pair.connectorProbe.host.normalizeApplicationArguments(
						[],
					);
					const outcomes: RpcCallOutcome[] = [];
					const ownerFaultsBefore = pair.connectorProbe.ownerFaults.length;
					const sessionFaultsBefore = pair.connectorProbe.sessionFaults.length;
					const sendsBeforePrepare = pair.transport.connectorSends;
					const invocation = pair.connectorSession.prepareInvocation(
						{ service: "service", method: "method", args },
						(outcome) => outcomes.push(outcome),
					);
					assertRpcConformance(
						invocation !== undefined,
						"Invocation was not prepared for cancellation.",
					);
					invocation.cancel();
					invocation.start();
					assertRpcConformance(
						pair.transport.connectorSends === sendsBeforePrepare &&
							outcomes.length === 1 &&
							outcomes[0]?.type === RpcCallTerminalTypeEnum.failed &&
							outcomes[0].code === RpcExceptionCodeEnum.canceled &&
							pair.connectorProbe.ownerFaults.length === ownerFaultsBefore &&
							pair.connectorProbe.sessionFaults.length === sessionFaultsBefore,
						"Pre-start cancellation did not synchronously win canceled and remain inert without a send or fault.",
					);
				},
			},
			...createIncomingDispositionCases(),
			{
				caseId: "protocol.fault.active-session-scope",
				run: async (scope) => {
					const pair = await scope.openPair();
					const message = fixture.createActiveProtocolFaultMessage();
					assertRpcConformance(
						message.byteLength > 0,
						"Fault fixture returned an empty message.",
					);
					await pair.transport.connectorConnection.send(message);
					await scope.waitFor(
						() => pair.acceptorProbe.sessionFaults.length > 0,
						"Active Session fault",
					);
					assertRpcConformance(
						pair.acceptorProbe.sessionFaults[0]?.reason ===
							RpcCloseReasonEnum.protocolFault &&
							pair.acceptorProbe.ownerFaults.length === 0,
						"Active grammar fault escaped the Session scope.",
					);
				},
			},
			{
				caseId: "protocol.counter.first-call-drains",
				candidate: fixture.counterExhaustionProtocol,
				run: async (scope) => {
					const pair = await scope.openPair();
					const args = pair.connectorProbe.host.normalizeApplicationArguments(
						[],
					);
					let finishCalls = 0;
					const invocation = pair.connectorSession.prepareInvocation(
						{ service: "service", method: "method", args },
						() => {
							finishCalls += 1;
						},
					);
					if (invocation !== undefined) {
						invocation.start();
					}
					await scope.waitFor(
						() => pair.connectorProbe.transitions.some(isCounterDrain),
						"Counter drain",
					);
					if (invocation === undefined) {
						assertRpcConformance(
							finishCalls === 0,
							"Definite Non-Execution finished a call.",
						);
					}
				},
			},
			{
				caseId: "protocol.termination.shutdown-phase",
				run: async (scope) => {
					const pair = await scope.openPair();
					await scope.waitForTask(
						pair.connector.shutdown(),
						"Protocol shutdown",
					);
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"shutdown() fulfilled before Direct Close.",
					);
					scope.close(pair.acceptor);
					await Promise.all([
						scope.waitForTask(
							scope.cleanup(pair.connector),
							"Connector cleanup",
						),
						scope.waitForTask(scope.cleanup(pair.acceptor), "Acceptor cleanup"),
					]);
				},
			},
			{
				caseId: "protocol.termination.close-phase",
				run: async (scope) => {
					const pair = await scope.openPair();
					const handlerOutcome = Promise.withResolvers<RpcHandlerOutcome>();
					pair.acceptorProbe.disposition = {
						kind: RpcIncomingCallKindEnum.handler,
						outcome: handlerOutcome.promise,
					};
					const args = pair.connectorProbe.host.normalizeApplicationArguments(
						[],
					);
					const activeOutcomes: RpcCallOutcome[] = [];
					const active = pair.connectorSession.prepareInvocation(
						{ service: "service", method: "method", args },
						(outcome) => activeOutcomes.push(outcome),
					);
					assertRpcConformance(
						active !== undefined,
						"Active close-phase invocation was not prepared.",
					);
					active.start();
					await scope.waitFor(
						() => pair.acceptorProbe.commitCount === 1,
						"Active close-phase incoming call",
					);

					const pendingOutcomes: RpcCallOutcome[] = [];
					const pending = pair.connectorSession.prepareInvocation(
						{ service: "service", method: "method", args },
						(outcome) => pendingOutcomes.push(outcome),
					);
					assertRpcConformance(
						pending !== undefined,
						"Pending close-phase invocation was not prepared.",
					);

					scope.close(pair.acceptor);
					assertRpcConformance(
						pair.transport.closeCount > 0,
						"close() did not synchronously invoke Direct Close.",
					);
					assertRpcConformance(
						pair.acceptorProbe.incomingFinishes.length === 1 &&
							pair.acceptorProbe.incomingFinishes[0]?.type ===
								RpcCallTerminalTypeEnum.sessionTerminated,
						"Acceptor close did not terminalize its active incoming call exactly once.",
					);

					scope.close(pair.connector);
					assertRpcConformance(
						activeOutcomes.length === 1 &&
							activeOutcomes[0]?.type === RpcCallTerminalTypeEnum.failed &&
							activeOutcomes[0].code === RpcExceptionCodeEnum.outcomeUnknown,
						"Connector close did not finish its admitted outgoing call exactly once.",
					);
					assertRpcConformance(
						pendingOutcomes.length === 1 &&
							pendingOutcomes[0]?.type === RpcCallTerminalTypeEnum.failed &&
							pendingOutcomes[0].code === RpcExceptionCodeEnum.unavailable,
						"Connector close did not finish its Pending Invocation exactly once.",
					);

					const acceptorSendsAfterClose = pair.transport.acceptorSends;
					handlerOutcome.resolve({
						type: RpcCallTerminalTypeEnum.returnedVoid,
					});
					await Promise.resolve();
					await Promise.resolve();
					assertRpcConformance(
						pair.acceptorProbe.incomingFinishes.length === 1 &&
							pair.transport.acceptorSends === acceptorSendsAfterClose,
						"A completed handler sent or finished again after close().",
					);
					await Promise.all([
						scope.waitForTask(
							scope.cleanup(pair.connector),
							"Connector cleanup",
						),
						scope.waitForTask(scope.cleanup(pair.acceptor), "Acceptor cleanup"),
					]);
				},
			},
			{
				caseId: "protocol.termination.cleanup-cached",
				run: async (scope) => {
					const protocol = scope.createRole(
						"connector",
						createConnectorHostProbe().host,
					);
					scope.close(protocol);
					const first = scope.cleanup(protocol);
					const second = scope.cleanup(protocol);
					assertRpcConformance(
						first === second,
						"cleanup() did not return its cached task.",
					);
					await scope.waitForTask(first, "Protocol cleanup");
				},
			},
		],
		options,
	);
}

type ProtocolCase = {
	readonly caseId: string;
	readonly candidate?: RpcProtocolConformanceCandidate;
	run(scope: IRpcProtocolCaseScope): void | Promise<void>;
};

function createIncomingDispositionCases(): ProtocolCase[] {
	return [
		{
			caseId: "protocol.incoming.resource-disposition",
			async run(scope) {
				const pair = await scope.openPair();
				pair.acceptorProbe.disposition = { kind: "resource" };
				const finishesBefore = pair.acceptorProbe.incomingFinishes.length;
				const outcome = await invokeWithValues(scope, pair, []);
				assertRpcConformance(
					outcome.type === RpcCallTerminalTypeEnum.failed &&
						outcome.code === RpcExceptionCodeEnum.unavailable,
					"Resource rejection did not finish unavailable.",
				);
				assertRpcConformance(
					pair.acceptorProbe.reservationCount === 1 &&
						pair.acceptorProbe.commitCount === 0 &&
						pair.acceptorProbe.handlerOutcomeReadCount === 0 &&
						pair.acceptorProbe.incomingFinishes.length === finishesBefore,
					"Resource rejection retained or committed incoming work.",
				);
			},
		},
		...(
			[
				RpcExceptionCodeEnum.unknownService,
				RpcExceptionCodeEnum.unknownMethod,
			] as const
		).map(
			(code): ProtocolCase => ({
				caseId: `protocol.incoming.semantic-${code}`,
				async run(scope) {
					const pair = await scope.openPair();
					pair.acceptorProbe.disposition = {
						kind: RpcIncomingCallKindEnum.unknown,
						code,
					};
					const finishesBefore = pair.acceptorProbe.incomingFinishes.length;
					const outcome = await invokeWithValues(scope, pair, []);
					const incomingTerminal =
						pair.acceptorProbe.incomingFinishes[finishesBefore];
					assertRpcConformance(
						outcome.type === RpcCallTerminalTypeEnum.failed &&
							outcome.code === code,
						`Semantic rejection did not finish ${code}.`,
					);
					assertRpcConformance(
						pair.acceptorProbe.commitCount === 1 &&
							pair.acceptorProbe.handlerOutcomeReadCount === 0 &&
							pair.acceptorProbe.incomingFinishes.length ===
								finishesBefore + 1 &&
							incomingTerminal !== undefined &&
							outcomesEqual(incomingTerminal, {
								type: RpcCallTerminalTypeEnum.failed,
								code,
							}),
						"Semantic rejection acquired a handler outcome.",
					);
				},
			}),
		),
		{
			caseId: "protocol.incoming.handler-dispositions-permit",
			async run(scope) {
				const pair = await scope.openPair();
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
					const finishesBefore = pair.acceptorProbe.incomingFinishes.length;
					const outcome = await invokeWithValues(scope, pair, []);
					const incomingTerminal =
						pair.acceptorProbe.incomingFinishes[finishesBefore];
					assertRpcConformance(
						outcomesEqual(outcome, expectation.caller) &&
							pair.acceptorProbe.incomingFinishes.length ===
								finishesBefore + 1 &&
							incomingTerminal !== undefined &&
							outcomesEqual(incomingTerminal, expectation.caller),
						"Handler disposition changed at the outgoing sink.",
					);
				}
				assertRpcConformance(
					pair.acceptorProbe.commitCount === 3 &&
						pair.acceptorProbe.handlerOutcomeReadCount === 3,
					"Handler permit outcome was not owned exactly once per committed call.",
				);
			},
		},
	];
}

function invokeWithValues(
	scope: IRpcProtocolCaseScope,
	pair: ProtocolPair,
	values: readonly RpcApplicationValue[],
): Promise<RpcCallOutcome> {
	return invoke(
		scope,
		pair.connectorSession,
		pair.connectorProbe.host.normalizeApplicationArguments(values),
	);
}

async function invoke(
	scope: IRpcProtocolCaseScope,
	session: IRpcProtocolSession,
	args: IRpcApplicationArgumentsSnapshot,
): Promise<RpcCallOutcome> {
	const { promise: outcome, resolve: finish } =
		Promise.withResolvers<RpcCallOutcome>();
	const invocation = session.prepareInvocation(
		{ service: "service", method: "method", args },
		finish,
	);
	assertRpcConformance(
		invocation !== undefined,
		"Invocation capacity was unavailable.",
	);
	invocation.start();
	return scope.waitForTask(outcome, "Invocation sink");
}

function outcomesEqual(
	left: RpcCallOutcome | RpcIncomingTerminal,
	right: RpcCallOutcome | RpcIncomingTerminal,
): boolean {
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

function runProtocolCases(
	candidate: RpcProtocolConformanceCandidate,
	cases: readonly ProtocolCase[],
	options?: RpcConformanceOptions,
): Promise<void> {
	return runRpcConformanceCases(
		cases.map(
			(testCase): IRpcConformanceCase => ({
				caseId: testCase.caseId,
				run: () =>
					createRpcProtocolCaseLifetime().run(
						testCase.candidate ?? candidate,
						(scope) => testCase.run(scope),
					),
			}),
		),
		options,
	);
}
