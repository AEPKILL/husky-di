/**
 * @overview Verifies rpc session invocation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	normalizeRpcApplicationArguments,
	RpcCallTerminalTypeEnum,
} from "../../src/modules/protocol";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { createRpcDirectSessionHarness } from "./test.utils";

describe("Default RPC Session authority plans", () => {
	it("RPC-SPI-004 keeps preparation identity-free until start", async () => {
		const { session, sent } = createRpcDirectSessionHarness();
		const finishes: unknown[] = [];
		const delayed = session.prepareInvocation(
			{
				service: "example.atomic-prepare.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(["delayed"]),
			},
			(outcome) => finishes.push(outcome),
		);
		if (delayed === undefined) {
			throw new Error("Expected the earlier Pending Invocation capacity.");
		}
		const invocation = session.prepareInvocation(
			{
				service: "example.atomic-prepare.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(["value"]),
			},
			(outcome) => finishes.push(outcome),
		);
		if (invocation === undefined) {
			throw new Error("Expected Pending Invocation capacity.");
		}

		expect(finishes).toEqual([]);
		expect(sent).toEqual([]);
		expect(session._callRetention.replayCount).toBe(0);

		invocation.start();
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toMatchObject({
			kind: "message",
			seq: 1,
			message: { kind: "call", callId: "1", args: ["value"] },
		});
		expect(session._callRetention.replayCount).toBe(1);
		// Preparation order cannot reserve identities ahead of the start gate.
		delayed.start();
		await vi.waitFor(() => expect(sent).toHaveLength(2));
		expect(sent[1]).toMatchObject({
			kind: "message",
			seq: 2,
			message: { kind: "call", callId: "2", args: ["delayed"] },
		});
		expect(finishes).toEqual([]);
		session.forceClose();
	});

	it("RPC-SPI-004 keeps start inert after canceling a Pending Invocation", async () => {
		const { session, sent, faults } = createRpcDirectSessionHarness({
			maxPendingInvocationsPerSession: 1,
		});
		const finishes: unknown[] = [];
		const request = {
			service: "example.canceled-prepare.v1",
			method: "run",
			args: normalizeRpcApplicationArguments([]),
		};
		const invocation = session.prepareInvocation(request, (outcome) =>
			finishes.push(outcome),
		);
		if (invocation === undefined) {
			throw new Error("Expected Pending Invocation capacity.");
		}

		invocation.cancel();
		invocation.start();
		invocation.start();
		invocation.cancel();

		expect(finishes).toEqual([
			{
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.canceled,
			},
		]);
		expect(faults).toEqual([]);
		expect(sent).toEqual([]);
		expect(session._callRetention.replayCount).toBe(0);

		const replacement = session.prepareInvocation(request, () => undefined);
		if (replacement === undefined) {
			throw new Error("Expected canceled Pending capacity to be reusable.");
		}
		replacement.start();
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]).toMatchObject({
			kind: "message",
			seq: 1,
			message: { kind: "call", callId: "1" },
		});
		session.forceClose();
		expect(finishes).toHaveLength(1);
	});
});
