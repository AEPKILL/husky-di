/**
 * @overview Protocol resource, semantic and handler-disposition conformance cases.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcProtocolCaseScope } from "@/conformance/interfaces/rpc-protocol-case-lifetime.interface";
import { assertRpcConformance } from "@/conformance/rpc-conformance.util";
import { invokeProtocolCase } from "@/conformance/rpc-protocol-case.util";
import type {
	ProtocolCase,
	ProtocolPair,
} from "@/conformance/types/rpc-protocol-case.type";
import type {
	RpcApplicationValue,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
} from "@/modules/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
	rpcApplicationValuesEqual,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export function createIncomingDispositionCases(): ProtocolCase[] {
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
	return invokeProtocolCase(
		scope,
		pair.connectorSession,
		pair.connectorProbe.host.normalizeApplicationArguments(values),
	);
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
