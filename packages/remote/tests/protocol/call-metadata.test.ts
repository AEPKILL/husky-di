/**
 * @overview Verifies Call Metadata custody, replay, and retained-byte admission.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import { describe, expect, it, vi } from "vitest";
import type { IRpcProtocolCallRequest } from "../../src/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCallTerminalTypeEnum,
	RpcCodecImpl,
	RpcDecodePhaseEnum,
} from "../../src/modules/protocol";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { createCall, createIncomingCalls } from "./incoming-calls/test.utils";
import { createRpcDirectSessionHarness } from "./test.utils";

describe("Default RPC Call Metadata", () => {
	it("RPC-INTERCEPT-005 RPC-WIRE-011 RPC-SPI-003 snapshots metadata for Framework admission separately from arguments", () => {
		const normalizeApplicationValue = vi.fn(normalizeRpcApplicationValue);
		const harness = createIncomingCalls({ normalizeApplicationValue });
		const metadata = { traceId: "trace-1", baggage: { sampled: true } };
		harness.incoming.receiveCall({ ...createCall("1"), metadata });
		metadata.baggage.sampled = false;

		expect(normalizeApplicationValue).toHaveBeenCalledExactlyOnceWith(metadata);
		const request = harness.reserveIncomingCall.mock.calls[0]?.[0];
		expect(request?.args.value).toEqual([1]);
		expect(request?.metadata?.value).toEqual({
			traceId: "trace-1",
			baggage: { sampled: true },
		});
		expect(Object.isFrozen(request?.metadata?.value.baggage)).toBe(true);
		harness.close();
	});

	it("RPC-INTERCEPT-005 RPC-LEDGER-003 RPC-VALUE-004 validates metadata before draining rejection and observes reentrant drain", () => {
		const harness = createIncomingCalls({
			normalizeApplicationValue: (metadata) => {
				harness.startDraining();
				return normalizeRpcApplicationValue(metadata);
			},
		});
		expect(() =>
			harness.incoming.receiveCall({
				...createCall("1"),
				metadata: { traceId: "x".repeat(524_289) },
			}),
		).toThrow(TypeError);
		expect(harness.messages).toEqual([]);
		harness.incoming.receiveCall({
			...createCall("1"),
			metadata: { traceId: "trace-1" },
		});
		expect(harness.reserveIncomingCall).not.toHaveBeenCalled();
		expect(harness.messages).toEqual([
			expect.objectContaining({
				callId: "1",
				error: expect.objectContaining({
					code: RpcExceptionCodeEnum.unavailable,
				}),
			}),
		]);
		harness.close();
	});

	it("RPC-INTERCEPT-005 RPC-VALUE-004 rejects combined application trees beyond the wire-node budget before admission", async () => {
		const harness = createRpcDirectSessionHarness();
		const finish = vi.fn();
		const invocation = harness.session.prepareInvocation(
			{
				service: "example.metadata.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(
					Array.from({ length: 8 }, () => Array(8_000).fill(null)),
				),
				metadata: normalizeRpcApplicationValue({
					baggage: Array(2_048).fill(null),
				}) as NonNullable<IRpcProtocolCallRequest["metadata"]>,
			},
			finish,
		);
		expect(invocation).toBeDefined();
		invocation?.start();
		await vi.waitFor(() =>
			expect(finish).toHaveBeenCalledExactlyOnceWith({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.unavailable,
			}),
		);
		expect(harness.sent).toEqual([]);
		expect(harness.faults).toEqual([]);
		harness.session.forceClose();
	});

	it("RPC-INTERCEPT-005 RPC-WIRE-011 RPC-ACK-004 sends the detached metadata unchanged on recovery replay", async () => {
		const harness = createRpcDirectSessionHarness();
		const metadata = { traceId: "trace-1", baggage: { sampled: true } };
		const request: IRpcProtocolCallRequest = {
			service: "example.metadata.v1",
			method: "run",
			args: normalizeRpcApplicationArguments(["business-argument"]),
			metadata: normalizeRpcApplicationValue(metadata) as NonNullable<
				IRpcProtocolCallRequest["metadata"]
			>,
		};
		const invocation = harness.session.prepareInvocation(request, () => {});
		expect(invocation).toBeDefined();
		metadata.traceId = "changed";
		metadata.baggage.sampled = false;
		invocation?.start();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));
		const original = harness.sent[0];
		expect(original).toMatchObject({
			seq: 1,
			message: {
				callId: "1",
				args: ["business-argument"],
				metadata: { traceId: "trace-1", baggage: { sampled: true } },
			},
		});
		const codec = new RpcCodecImpl();
		expect(
			codec.decode(
				new TextEncoder().encode(JSON.stringify(original)),
				RpcDecodePhaseEnum.active,
			),
		).toEqual(original);

		harness.session._enterRecovery();
		harness.installReplacement();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(2));
		expect(harness.sent[1]).toEqual(original);
		expect(harness.faults).toEqual([]);
		harness.session.forceClose();
	});

	it("RPC-INTERCEPT-005 RPC-RESOURCE-001 RPC-RESOURCE-005 charges metadata against Pending capacity and releases it on cancellation", () => {
		const harness = createRpcDirectSessionHarness({
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
		});
		const request: IRpcProtocolCallRequest = {
			service: "example.metadata.v1",
			method: "run",
			args: normalizeRpcApplicationArguments([]),
			metadata: normalizeRpcApplicationValue({
				baggage: "x".repeat(400_000),
			}) as NonNullable<IRpcProtocolCallRequest["metadata"]>,
		};
		const first = harness.session.prepareInvocation(request, () => {});
		const second = harness.session.prepareInvocation(request, () => {});
		expect(first).toBeDefined();
		expect(second).toBeDefined();
		expect(
			harness.session.prepareInvocation(request, () => {}),
		).toBeUndefined();
		first?.cancel();
		expect(harness.session.prepareInvocation(request, () => {})).toBeDefined();
		expect(harness.sent).toEqual([]);
		harness.session.forceClose();
	});

	it("RPC-INTERCEPT-005 RPC-RESOURCE-001 RPC-RESOURCE-005 RPC-ACK-004 charges metadata in replay and makes ACK capacity reusable", async () => {
		const harness = createRpcDirectSessionHarness({
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
		});
		const request: IRpcProtocolCallRequest = {
			service: "example.metadata.v1",
			method: "run",
			args: normalizeRpcApplicationArguments([]),
			metadata: normalizeRpcApplicationValue({
				baggage: "x".repeat(450_000),
			}) as NonNullable<IRpcProtocolCallRequest["metadata"]>,
		};
		for (let count = 1; count <= 4; count += 1) {
			harness.session.prepareInvocation(request, () => {})?.start();
			await vi.waitFor(() => expect(harness.sent).toHaveLength(count));
		}
		const finish = vi.fn();
		harness.session.prepareInvocation(request, finish)?.start();
		await vi.waitFor(() =>
			expect(finish).toHaveBeenCalledExactlyOnceWith({
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.unavailable,
			}),
		);
		expect(harness.sent).toHaveLength(4);
		harness.receive(new TextEncoder().encode('{"kind":"ack","ackThrough":4}'));
		harness.session.prepareInvocation(request, () => {})?.start();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(5));
		expect(harness.sent[4]).toMatchObject({ seq: 5, message: { callId: "5" } });
		expect(harness.faults).toEqual([]);
		harness.session.forceClose();
	});

	it("RPC-INTERCEPT-005 RPC-ACK-005 RPC-LEDGER-002 suppresses validated duplicate metadata and rejects fresh-sequence identity reuse", async () => {
		const harness = createRpcDirectSessionHarness();
		const message = {
			kind: "call",
			callId: "1",
			service: "example.metadata.v1",
			method: "run",
			args: [],
			metadata: { traceId: "trace-1" },
		};
		const encoder = new TextEncoder();
		const receive = (seq: number) =>
			harness.receive(
				encoder.encode(JSON.stringify({ kind: "message", seq, message })),
			);
		receive(1);
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));
		message.metadata.traceId = "duplicate";
		receive(1);
		expect(harness.faults).toEqual([]);
		expect(
			harness.sent.filter((record) => record.kind === "message"),
		).toHaveLength(1);
		receive(2);
		expect(harness.faults).toEqual([RpcCloseReasonEnum.protocolFault]);
		harness.session.forceClose();
	});
});
