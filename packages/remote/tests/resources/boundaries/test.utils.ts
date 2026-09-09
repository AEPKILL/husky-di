/**
 * @overview Shared resources/protocol-boundaries fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import type {
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	RpcEndpointFailureEnum,
	RpcJsonRecord,
	RpcJsonValue,
} from "../../../src/modules/protocol";
import {
	createRpcSessionActivity,
	createRpcSessionCallRetention,
	createRpcSessionConnection,
	createRpcSessionContinuity,
	createRpcSessionDelivery,
	createRpcSessionIncomingCalls,
	createRpcSessionInvocations,
	createRpcSessionShutdown,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCodecImpl,
	RpcDecodePhaseEnum,
	RpcEndpointImpl,
	RpcSessionImpl,
	RpcWireRecordKindEnum,
	rpcApplicationValuesEqual,
} from "../../../src/modules/protocol";
import type { IRpcConnection } from "../../../src/modules/transport";
import { RpcExceptionCodeEnum } from "../../../src/shared/enums/rpc-exception-code.enum";
import { RpcRetainedBytesLedgerImpl } from "../../../src/shared/impls/rpc-retained-bytes-ledger.impl";

export const encoder = new TextEncoder();

export const codec = new RpcCodecImpl();

export const mebibyte = 1024 * 1024;

export function decodeJson(source: string): void {
	codec.decode(encoder.encode(source), RpcDecodePhaseEnum.json);
}

export function createNodeBoundaryJson(totalNodes: number): string {
	const innerArrays = 8;
	let remainingLeaves = totalNodes - 3 - innerArrays;
	const chunks: string[] = [];
	for (let index = 0; index < innerArrays; index += 1) {
		const leaves = Math.min(8192, remainingLeaves);
		chunks.push(`[${"null,".repeat(leaves - 1)}null]`);
		remainingLeaves -= leaves;
	}
	return `{"kind":"ping","future":[${chunks.join(",")}]}`;
}

export function createNestedApplicationValue(depth: number): RpcJsonValue {
	let value: RpcJsonValue = null;
	for (let index = 1; index < depth; index += 1) {
		value = [value];
	}
	return value;
}

export function createApplicationArgumentsWithNodes(
	totalNodes: number,
): readonly RpcJsonValue[] {
	const innerArrays = 8;
	let remainingLeaves = totalNodes - 1 - innerArrays;
	const chunks: RpcJsonValue[][] = [];
	for (let index = 0; index < innerArrays; index += 1) {
		const leaves = Math.min(8192, remainingLeaves);
		chunks.push(Array.from({ length: leaves }, () => null));
		remainingLeaves -= leaves;
	}
	return chunks;
}

export function createApplicationRecordWithNodes(
	totalNodes: number,
): RpcJsonRecord {
	const value = Object.create(null) as Record<string, RpcJsonValue>;
	let remainingLeaves = totalNodes - 1 - 1024;
	for (let index = 0; index < 1024; index += 1) {
		const leaves = Math.min(63, remainingLeaves);
		value[`key${index}`] = Array.from({ length: leaves }, () => null);
		remainingLeaves -= leaves;
	}
	return value;
}

export function createApplicationMessages(
	args: readonly RpcJsonValue[],
	value: RpcJsonValue,
): readonly RpcJsonRecord[] {
	return [
		{
			kind: RpcWireRecordKindEnum.call,
			callId: "1",
			service: "example.boundary.v1",
			method: "run",
			args,
		},
		{ kind: RpcWireRecordKindEnum.result, callId: "1", value },
		{
			kind: RpcWireRecordKindEnum.error,
			callId: "1",
			error: {
				code: RpcExceptionCodeEnum.unavailable,
				message: "Remote call failed.",
				details: value,
			},
		},
	];
}

export function createEndpoint(messages: readonly Uint8Array[]): {
	readonly endpoint: RpcEndpointImpl;
	readonly failures: RpcEndpointFailureEnum[];
} {
	const messageSource = new Subject<Uint8Array>();
	const failures: RpcEndpointFailureEnum[] = [];
	const connection: IRpcConnection = {
		message$: messageSource.asObservable(),
		async send() {},
		async close() {},
	};
	const endpoint = new RpcEndpointImpl({
		connection,
		onMessage: () => {},
		onFailure: (reason) => failures.push(reason),
	});
	for (const message of messages) {
		messageSource.next(message);
	}
	return { endpoint, failures };
}

export function createSession(
	policy: Partial<IRpcProtocolRuntimePolicy> = {},
): RpcSessionImpl {
	const runtimePolicy = { ...defaultPolicy, ...policy };
	const retainedBytes = new RpcRetainedBytesLedgerImpl(
		runtimePolicy.maxRetainedBytesTotal,
	);
	const host: IRpcProtocolHost = {
		policy: runtimePolicy,
		reserveRetainedBytes: (bytes) => retainedBytes.reserve(bytes),
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault() {},
	};
	return new RpcSessionImpl(
		{
			host,
			sessionId: "boundary-session",
			resumeToken: "boundary-resume-token",
			onTerminal: () => {},
		},
		{
			codec,
			createActivity: createRpcSessionActivity,
			createCallRetention: createRpcSessionCallRetention,
			createConnection: createRpcSessionConnection,
			createContinuity: createRpcSessionContinuity,
			createDelivery: createRpcSessionDelivery,
			createShutdown: createRpcSessionShutdown,
			createIncomingCalls: createRpcSessionIncomingCalls,
			createInvocations: createRpcSessionInvocations,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				runtimePolicy.maxRetainedBytesPerSession,
			),
		},
	);
}

const defaultPolicy: IRpcProtocolRuntimePolicy = {
	maxSessions: 1,
	maxHandshakes: 1,
	maxPendingInvocationsPerSession: 256,
	maxRetainedBytesPerSession: 32 * mebibyte,
	maxRetainedBytesTotal: 32 * mebibyte,
	maxHandlersPerSession: 16,
	maxHandlersTotal: 16,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
};
