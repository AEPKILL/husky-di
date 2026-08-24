/**
 * @overview Executable limit-minus-one, limit, and limit-plus-one evidence for Default Protocol resources.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	RPC_MAX_WIRE_DEPTH,
	RPC_MAX_WIRE_NODES,
} from "../../src/constants/protocol/rpc-profile.const";
import { RpcDecodePhaseEnum } from "../../src/enums/protocol/rpc-decode-phase.enum";
import type { RpcEndpointFailureEnum } from "../../src/enums/protocol/rpc-endpoint-failure.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcEndpointImpl } from "../../src/impls/protocol/rpc-endpoint.impl";
import { RpcRetainedBytesLedgerImpl } from "../../src/impls/protocol/rpc-retained-bytes-ledger.impl";
import { RpcSessionImpl } from "../../src/impls/protocol/rpc-session.impl";
import type {
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnection } from "../../src/interfaces/rpc-connection.interface";
import type {
	RpcJsonRecord,
	RpcJsonValue,
} from "../../src/types/protocol/rpc-wire-record.type";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";

const encoder = new TextEncoder();
const codec = new RpcCodecImpl();
const mebibyte = 1024 * 1024;
const defaultPolicy: IRpcProtocolRuntimePolicy = {
	maxSessions: 1,
	maxHandshakes: 1,
	maxApplicationWorkPerSession: 256,
	maxApplicationWorkTotal: 256,
	maxActiveStreamsPerSession: 16,
	maxActiveStreamsTotal: 16,
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

function decodeJson(source: string): void {
	codec.decode(encoder.encode(source), RpcDecodePhaseEnum.json);
}

function createNodeBoundaryJson(totalNodes: number): string {
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

function createNestedApplicationValue(depth: number): RpcJsonValue {
	let value: RpcJsonValue = null;
	for (let index = 1; index < depth; index += 1) {
		value = [value];
	}
	return value;
}

function createApplicationArgumentsWithNodes(
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

function createApplicationRecordWithNodes(totalNodes: number): RpcJsonRecord {
	const value = Object.create(null) as Record<string, RpcJsonValue>;
	let remainingLeaves = totalNodes - 1 - 1024;
	for (let index = 0; index < 1024; index += 1) {
		const leaves = Math.min(63, remainingLeaves);
		value[`key${index}`] = Array.from({ length: leaves }, () => null);
		remainingLeaves -= leaves;
	}
	return value;
}

function createApplicationMessages(
	args: readonly RpcJsonValue[],
	value: RpcJsonValue,
): readonly RpcJsonRecord[] {
	return [
		{
			kind: RpcWireRecordKindEnum.call,
			callId: "1",
			service: "example.boundary.v1",
			member: "run",
			args,
		},
		{ kind: RpcWireRecordKindEnum.result, callId: "1", value },
	];
}

function createEndpoint(messages: readonly Uint8Array[]): {
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

function createSession(
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
	return new RpcSessionImpl({
		host,
		sessionId: "boundary-session",
		proofKey: {} as CryptoKey,
		codec,
		onTerminal: () => {},
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			runtimePolicy.maxRetainedBytesPerSession,
		),
	});
}

describe("Default RPC Protocol resource boundaries", () => {
	it("RPC-WIRE-003 rejects reserved-looking unknown Error payload members", () => {
		const source =
			'{"kind":"message","seq":1,"message":{"kind":"error","callId":"1","error":{"code":"canceled","message":"failed","__proto__":0}}}';

		expect(() =>
			codec.decode(encoder.encode(source), RpcDecodePhaseEnum.active),
		).toThrow("RPC error payload contains an unknown member.");
	});

	it("RPC-VALUE-004 RPC-WIRE-003 round-trips Application Value depth and node boundaries through active envelopes", () => {
		const boundaryCases = [
			{
				name: "depth 64",
				args: normalizeRpcApplicationArguments(createNestedApplicationValue(64))
					.value,
				value: normalizeRpcApplicationValue(createNestedApplicationValue(64))
					.value,
			},
			{
				name: "nodes 65536",
				args: normalizeRpcApplicationArguments(
					createApplicationArgumentsWithNodes(65_536),
				).value,
				value: normalizeRpcApplicationValue(
					createApplicationRecordWithNodes(65_536),
				).value,
			},
		];

		for (const boundary of boundaryCases) {
			for (const message of createApplicationMessages(
				boundary.args,
				boundary.value,
			)) {
				const envelope = {
					kind: RpcWireRecordKindEnum.message,
					seq: 1,
					ackThrough: 0,
					message,
				};
				expect(
					() => codec.decode(codec.encode(envelope), RpcDecodePhaseEnum.active),
					`${boundary.name} ${String(message.kind)}`,
				).not.toThrow();
			}
		}
	});

	it("RPC-VALUE-004 RPC-WIRE-003 rejects Application Values beyond their local depth and node boundaries", () => {
		const beyondBoundaryCases = [
			{
				name: "depth 65",
				args: createNestedApplicationValue(65) as readonly RpcJsonValue[],
				value: createNestedApplicationValue(65),
			},
			{
				name: "nodes 65537",
				args: createApplicationArgumentsWithNodes(65_537),
				value: createApplicationRecordWithNodes(65_537),
			},
		];

		for (const boundary of beyondBoundaryCases) {
			for (const message of createApplicationMessages(
				boundary.args,
				boundary.value,
			)) {
				expect(
					() =>
						codec.decode(
							codec.encode({
								kind: RpcWireRecordKindEnum.message,
								seq: 1,
								message,
							}),
							RpcDecodePhaseEnum.active,
						),
					`${boundary.name} ${String(message.kind)}`,
				).toThrow();
			}
		}
	});

	it("RPC-CORPUS-004 executes limit-1, limit, and limit+1 for every fixed Codec allocation boundary", () => {
		const objectWithMembers = (members: number) =>
			`{"kind":"ping","future":{${Array.from(
				{ length: members },
				(_, index) => `"k${index}":null`,
			).join(",")}}}`;
		const arrayWithElements = (elements: number) =>
			`{"kind":"ping","future":[${"null,".repeat(elements - 1)}null]}`;
		const boundaries = [
			{
				name: `wire depth ${RPC_MAX_WIRE_DEPTH}`,
				create: (value: number) =>
					`{"kind":"ping","future":${"[".repeat(value - 2)}null${"]".repeat(value - 2)}}`,
				limit: RPC_MAX_WIRE_DEPTH,
			},
			{
				name: "string UTF-8 bytes 524288",
				create: (value: number) =>
					`{"kind":"ping","future":"${"a".repeat(value)}"}`,
				limit: 524_288,
			},
			{
				name: "member-name UTF-8 bytes 256",
				create: (value: number) =>
					`{"kind":"ping","${"a".repeat(value)}":null}`,
				limit: 256,
			},
			{
				name: "object members 1024",
				create: objectWithMembers,
				limit: 1024,
			},
			{
				name: "array elements 8192",
				create: arrayWithElements,
				limit: 8192,
			},
			{
				name: `wire JSON nodes ${RPC_MAX_WIRE_NODES}`,
				create: createNodeBoundaryJson,
				limit: RPC_MAX_WIRE_NODES,
			},
		];

		for (const boundary of boundaries) {
			expect(
				() => decodeJson(boundary.create(boundary.limit - 1)),
				`${boundary.name} limit-1`,
			).not.toThrow();
			expect(
				() => decodeJson(boundary.create(boundary.limit)),
				`${boundary.name} limit`,
			).not.toThrow();
			expect(
				() => decodeJson(boundary.create(boundary.limit + 1)),
				`${boundary.name} limit+1`,
			).toThrow();
		}

		const base = '{"kind":"ping"}';
		const messageAt = (bytes: number) =>
			base + " ".repeat(bytes - encoder.encode(base).byteLength);
		expect(
			() => decodeJson(messageAt(mebibyte - 1)),
			"Transport message bytes limit-1",
		).not.toThrow();
		expect(
			() => decodeJson(messageAt(mebibyte)),
			"Transport message bytes limit",
		).not.toThrow();
		expect(
			() => decodeJson(messageAt(mebibyte + 1)),
			"Transport message bytes limit+1",
		).toThrow();
	});

	it("RPC-CORPUS-004 RPC-SCHEDULE-005 executes message, record, and byte backlog triplets and charges reentrant input", async () => {
		for (const [size, failure] of [
			[mebibyte - 1, undefined],
			[mebibyte, undefined],
			[mebibyte + 1, "protocol"],
		] as const) {
			const result = createEndpoint([new Uint8Array(size)]);
			expect(result.failures, `message bytes ${size}`).toEqual(
				failure === undefined ? [] : [failure],
			);
			result.endpoint.fenceAndClose();
		}

		for (const [records, failure] of [
			[63, undefined],
			[64, undefined],
			[65, "resource"],
		] as const) {
			const result = createEndpoint(
				Array.from({ length: records }, () => new Uint8Array(1)),
			);
			expect(result.failures, `ingress records ${records}`).toEqual(
				failure === undefined ? [] : [failure],
			);
			result.endpoint.fenceAndClose();
		}

		for (const [bytes, failure] of [
			[8 * mebibyte - 1, undefined],
			[8 * mebibyte, undefined],
			[8 * mebibyte + 1, "resource"],
		] as const) {
			const fullMessages = Math.floor(bytes / mebibyte);
			const remainder = bytes % mebibyte;
			const messages = Array.from(
				{ length: fullMessages },
				() => new Uint8Array(mebibyte),
			);
			if (remainder !== 0) {
				messages.push(new Uint8Array(remainder));
			}
			const result = createEndpoint(messages);
			expect(result.failures, `ingress bytes ${bytes}`).toEqual(
				failure === undefined ? [] : [failure],
			);
			result.endpoint.fenceAndClose();
		}

		const source = new Subject<Uint8Array>();
		const order: number[] = [];
		let callbackDepth = 0;
		let maximumCallbackDepth = 0;
		const endpoint = new RpcEndpointImpl({
			connection: {
				message$: source.asObservable(),
				async send() {},
				async close() {},
			},
			onMessage: (message) => {
				callbackDepth += 1;
				maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
				order.push(message[0] as number);
				if (message[0] === 1) {
					source.next(Uint8Array.of(2));
				}
				callbackDepth -= 1;
			},
			onFailure: () => {},
		});
		source.next(Uint8Array.of(1));
		await vi.waitFor(() => expect(order).toEqual([1, 2]));
		expect(maximumCallbackDepth).toBe(1);
		endpoint.fenceAndClose();
	});

	it("RPC-CORPUS-004 RPC-RESOURCE-005 executes Pending count and byte subcap triplets", () => {
		for (const delta of [-1, 0, 1]) {
			const session = createSession({
				maxRetainedBytesPerSession: 4 * mebibyte,
				maxRetainedBytesTotal: 4 * mebibyte,
			});
			const reserve = (stringBytes: number) =>
				session.reserveInvocation({
					service: "example.boundary.v1",
					method: "run",
					args: normalizeRpcApplicationArguments(["x".repeat(stringBytes)]),
				});
			const first = reserve(524_028);
			const second = reserve(524_028 + delta);
			expect(
				first,
				`Pending bytes ${delta < 0 ? "limit-1" : "first half"}`,
			).toBeDefined();
			expect(
				second,
				`Pending bytes ${delta === -1 ? "limit-1" : delta === 0 ? "limit" : "limit+1"}`,
			).toEqual(delta <= 0 ? expect.any(Object) : undefined);
			first?.release();
			second?.release();
			session.forceClose();
		}

		const session = createSession({ maxApplicationWorkPerSession: 2 });
		const reserve = () =>
			session.reserveInvocation({
				service: "example.boundary.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			});
		const limitMinusOne = reserve();
		const limit = reserve();
		const limitPlusOne = reserve();
		expect(limitMinusOne, "Pending entries limit-1").toBeDefined();
		expect(limit, "Pending entries limit").toBeDefined();
		expect(limitPlusOne, "Pending entries limit+1").toBeUndefined();
		limitMinusOne?.release();
		limit?.release();
		session.forceClose();
	});

	it("RPC-CALL-005 RPC-RESOURCE-001 retracts canceled Pending storage without a send slot", () => {
		const session = createSession({ maxApplicationWorkPerSession: 1 });
		const finishes: unknown[] = [];
		for (let index = 0; index < 3; index += 1) {
			const reservation = session.reserveInvocation({
				service: "example.pending-cancel.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(["x".repeat(1024)]),
			});
			if (reservation === undefined) {
				throw new Error(
					"Expected Pending Invocation capacity after cancellation.",
				);
			}
			const invocation = reservation.commit({
				finish: (outcome) => finishes.push(outcome),
			});
			const [entry] = session._invocations;
			if (entry === undefined) {
				throw new Error("Expected the committed Pending Invocation entry.");
			}

			invocation.start();
			invocation.cancel();

			expect(session._pendingInvocations).toHaveLength(0);
			expect(entry.request).toBeUndefined();
		}
		expect(finishes).toEqual([
			{ type: "failed", code: "canceled" },
			{ type: "failed", code: "canceled" },
			{ type: "failed", code: "canceled" },
		]);
		expect(session._invocations.size).toBe(0);
		expect(session._invocationCount).toBe(0);
		expect(session._pendingInvocationBytes).toBe(0);
		session.forceClose();
	});

	it("RPC-CORPUS-004 executes ordinary replay and protected terminal/cancel entry triplets", () => {
		const ordinary = createSession({ maxApplicationWorkPerSession: 1 });
		for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
			expect(
				ordinary._queueSemantic({
					kind: RpcWireRecordKindEnum.result,
					callId: String(ordinal),
				}),
				"ordinary replay entries limit-1",
			).toBe(true);
		}
		expect(
			ordinary._queueSemantic({
				kind: RpcWireRecordKindEnum.result,
				callId: "4",
			}),
			"ordinary replay entries limit",
		).toBe(true);
		expect(
			ordinary._queueSemantic({
				kind: RpcWireRecordKindEnum.result,
				callId: "5",
			}),
			"ordinary replay entries limit+1",
		).toBe(false);
		ordinary.forceClose();

		for (const kind of ["terminal", "cancel"] as const) {
			const protectedSession = createSession();
			const queue = (ordinal: number) =>
				kind === "terminal"
					? protectedSession._queueSemantic({
							kind: RpcWireRecordKindEnum.error,
							callId: String(ordinal),
							error: {
								code: RpcExceptionCodeEnum.unavailable,
								message: "Remote call failed with code unavailable.",
							},
						})
					: protectedSession._queueSemantic({
							kind: RpcWireRecordKindEnum.cancel,
							callId: String(ordinal),
						});
			for (let ordinal = 1; ordinal <= 255; ordinal += 1) {
				expect(queue(ordinal), `${kind} entries limit-1`).toBe(true);
			}
			expect(queue(256), `${kind} entries limit`).toBe(true);
			expect(queue(257), `${kind} entries limit+1`).toBe(false);
			protectedSession.forceClose();
		}
	});
});
