/**
 * @overview Verifies protocol queue boundaries.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	normalizeRpcApplicationArguments,
	RPC_PROTECTED_SESSION_BYTES,
	RpcEndpointImpl,
	RpcWireRecordKindEnum,
} from "../../src/modules/protocol";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import {
	createEndpoint,
	createSession,
	mebibyte,
} from "./boundaries/test.utils";

describe("Default RPC Protocol resource boundaries", () => {
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
				session.prepareInvocation(
					{
						service: "example.boundary.v1",
						method: "run",
						args: normalizeRpcApplicationArguments(["x".repeat(stringBytes)]),
					},
					() => undefined,
				);
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
			first?.cancel();
			second?.cancel();
			session.forceClose();
		}

		const session = createSession({ maxPendingInvocationsPerSession: 2 });
		const reserve = () =>
			session.prepareInvocation(
				{
					service: "example.boundary.v1",
					method: "run",
					args: normalizeRpcApplicationArguments([]),
				},
				() => undefined,
			);
		const limitMinusOne = reserve();
		const limit = reserve();
		const limitPlusOne = reserve();
		expect(limitMinusOne, "Pending entries limit-1").toBeDefined();
		expect(limit, "Pending entries limit").toBeDefined();
		expect(limitPlusOne, "Pending entries limit+1").toBeUndefined();
		limitMinusOne?.cancel();
		limit?.cancel();
		session.forceClose();
	});

	it("RPC-CALL-005 RPC-RESOURCE-001 retracts canceled Pending storage without a send slot", () => {
		const session = createSession({ maxPendingInvocationsPerSession: 1 });
		const finishes: unknown[] = [];
		for (let index = 0; index < 3; index += 1) {
			const invocation = session.prepareInvocation(
				{
					service: "example.pending-cancel.v1",
					method: "run",
					args: normalizeRpcApplicationArguments(["x".repeat(1024)]),
				},
				(outcome) => finishes.push(outcome),
			);
			if (invocation === undefined) {
				throw new Error(
					"Expected Pending Invocation capacity after cancellation.",
				);
			}
			invocation.start();
			invocation.cancel();

			const reclaimed = session.reserveRetainedBytes(
				session._host.policy.maxRetainedBytesPerSession -
					RPC_PROTECTED_SESSION_BYTES,
			);
			expect(reclaimed).toBeDefined();
			reclaimed?.release();
		}
		expect(finishes).toEqual([
			{ type: "failed", code: "canceled" },
			{ type: "failed", code: "canceled" },
			{ type: "failed", code: "canceled" },
		]);
		session.forceClose();
	});

	it("RPC-CORPUS-004 executes ordinary replay and protected terminal/cancel entry triplets", () => {
		const ordinary = createSession({ maxPendingInvocationsPerSession: 1 });
		for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
			expect(
				ordinary._delivery.queueSemantic({
					kind: RpcWireRecordKindEnum.result,
					callId: String(ordinal),
				}),
				"ordinary replay entries limit-1",
			).toBe(true);
		}
		expect(
			ordinary._delivery.queueSemantic({
				kind: RpcWireRecordKindEnum.result,
				callId: "4",
			}),
			"ordinary replay entries limit",
		).toBe(true);
		expect(
			ordinary._delivery.queueSemantic({
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
					? protectedSession._delivery.queueSemantic({
							kind: RpcWireRecordKindEnum.error,
							callId: String(ordinal),
							error: {
								code: RpcExceptionCodeEnum.unavailable,
								message: "Remote call failed with code unavailable.",
							},
						})
					: protectedSession._delivery.queueSemantic({
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
