/**
 * @overview Verifies stream admission cancellation and shared pending-payload custody.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import { describe, expect, it, vi } from "vitest";
import { normalizeRpcApplicationArguments } from "../../src/modules/protocol";
import { createRpcDirectSessionHarness } from "./test.utils";

describe("stream outgoing admission", () => {
	it("RPC-STREAM-004 withdraws an unsent stream without consuming identity or emitting cancel", async () => {
		const harness = createRpcDirectSessionHarness();
		const gate = Promise.withResolvers<void>();
		const request = {
			service: "s",
			method: "ticks",
			args: normalizeRpcApplicationArguments([]),
		};
		const observer = { next: vi.fn(), complete: vi.fn(), error: vi.fn() };
		harness.setSendSettlement(gate.promise);
		harness.session.prepareStream(request, observer)?.start();
		const canceled = harness.session.prepareStream(request, observer);
		canceled?.start();
		canceled?.cancel();
		const later = harness.session.prepareStream(request, observer);
		later?.start();
		harness.setSendSettlement(undefined);
		gate.resolve();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(2));
		expect(harness.sent).toMatchObject([
			{ seq: 1, message: { kind: "stream-open", streamId: "1" } },
			{ seq: 2, message: { kind: "stream-open", streamId: "2" } },
		]);
		expect(observer.error).not.toHaveBeenCalled();
		expect(observer.complete).not.toHaveBeenCalled();
		harness.session.forceClose();
	});

	it.each([
		"stream",
		"unary",
	] as const)("RPC-STREAM-007 enforces one pending-byte subcap across streams and %s invocations", (firstKind) => {
		const harness = createRpcDirectSessionHarness({
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
			maxRetainedBytesTotal: 4 * 1024 * 1024,
		});
		const request = {
			service: "s",
			method: "ticks",
			args: normalizeRpcApplicationArguments(["x".repeat(400_000)]),
		};
		const observer = { next: vi.fn(), complete: vi.fn(), error: vi.fn() };
		const first =
			firstKind === "stream"
				? harness.session.prepareStream(request, observer)
				: harness.session.prepareInvocation(request, () => {});
		expect(first).toBeDefined();
		const second = harness.session.prepareStream(request, observer);
		expect(second).toBeDefined();
		expect(harness.session.prepareStream(request, observer)).toBeUndefined();
		expect(
			harness.session.prepareInvocation(request, () => {}),
		).toBeUndefined();
		second?.cancel();
		expect(harness.session.prepareInvocation(request, () => {})).toBeDefined();
		harness.session.forceClose();
	});

	it("RPC-STREAM-007 RPC-LEDGER-005 transfers originating payload custody to replay and releases it on open ACK", async () => {
		const maximum = 4 * 1024 * 1024;
		const harness = createRpcDirectSessionHarness({
			maxRetainedBytesPerSession: maximum,
			maxRetainedBytesTotal: maximum,
		});
		const request = {
			service: "s",
			method: "ticks",
			args: normalizeRpcApplicationArguments(["x".repeat(400_000)]),
		};
		const stream = harness.session.prepareStream(request, {
			next() {},
			complete() {},
			error() {},
		});
		stream?.start();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));
		harness.receive(
			new TextEncoder().encode(JSON.stringify({ kind: "ack", ackThrough: 1 })),
		);
		// The Session's 512 KiB protected reserve is the only retained protocol state.
		const remaining = harness.session.reserveRetainedBytes(
			maximum - 512 * 1024,
		);
		expect(remaining).toBeDefined();
		remaining?.release();
		harness.session.forceClose();
	});
});
