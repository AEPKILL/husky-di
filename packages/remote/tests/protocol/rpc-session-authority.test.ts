/**
 * @overview Verifies rpc session authority.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	normalizeRpcApplicationArguments,
	RpcCallTerminalTypeEnum,
	RpcEndpointFailureEnum,
} from "../../src/modules/protocol";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import {
	codec,
	createEndpoint,
	createSession,
	enterRecovery,
} from "./session/test.utils";
import { createRpcDirectSessionHarness } from "./test.utils";

describe("Default RPC Session authority plans", () => {
	it.each([
		"result",
		"error",
	] as const)("RPC-CALL-005 RPC-LEDGER-005 retains canceled admitted work until its late %s", async (kind) => {
		const { session, sent, receive, faults } = createRpcDirectSessionHarness({
			maxPendingInvocationsPerSession: 1,
		});
		const request = {
			service: "example.admitted-cancel.v1",
			method: "run",
			args: normalizeRpcApplicationArguments([]),
		};
		const finish = vi.fn();
		const invocation = session.prepareInvocation(request, finish);
		if (invocation === undefined) {
			throw new Error("Expected Invocation capacity.");
		}
		invocation.start();
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		invocation.cancel();
		await vi.waitFor(() => expect(sent).toHaveLength(2));
		expect(sent[1]).toMatchObject({
			kind: "message",
			seq: 2,
			message: { kind: "cancel", callId: "1" },
		});
		expect(finish.mock.calls).toEqual([
			[
				{
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.canceled,
				},
			],
		]);
		expect(session.prepareInvocation(request, () => undefined)).toBeUndefined();

		receive(
			codec.encode({
				kind: "message",
				seq: 1,
				ackThrough: 2,
				message:
					kind === "result"
						? { kind, callId: "1", value: "late" }
						: {
								kind,
								callId: "1",
								error: { code: "handler-failed", message: "Late failure." },
							},
			}),
		);
		const replacement = session.prepareInvocation(request, () => undefined);
		if (replacement === undefined) {
			throw new Error(
				"Expected authoritative terminal to restore Invocation capacity.",
			);
		}
		replacement.start();
		await vi.waitFor(() => expect(sent).toHaveLength(3));
		expect(sent[2]).toMatchObject({
			kind: "message",
			seq: 3,
			ackThrough: 1,
			message: { kind: "call", callId: "2" },
		});
		expect(faults).toEqual([]);
		session.forceClose();
		expect(finish).toHaveBeenCalledTimes(1);
	});

	it("binds a plan to its issuing Session and rejects a second install", () => {
		const issuer = createSession("issuer");
		const foreign = createSession("foreign");
		const plan = issuer.session.prepareFresh(issuer.sessionHost);
		const foreignPlan = foreign.session.prepareFresh(foreign.sessionHost);
		const binding = plan.install(createEndpoint());

		expect(binding.activate()).toBe(true);
		binding.fail(RpcEndpointFailureEnum.connection);

		expect(issuer.transitions).toEqual([
			{ type: "recovering", cause: undefined },
		]);
		expect(foreign.transitions).toEqual([]);
		expect(() => plan.install(createEndpoint())).toThrow(
			"Default RPC binding plan is unknown or already consumed.",
		);

		const foreignBinding = foreignPlan.install(createEndpoint());
		expect(foreignBinding.activate()).toBe(true);
		issuer.session.terminateForced();
		foreign.session.terminateForced();
	});

	it("commits a terminal decision exactly once", () => {
		const prepared = createSession("terminal");
		enterRecovery(prepared.session, prepared.sessionHost);
		const decision = prepared.session.beginResume().review({
			kind: "terminated",
		});
		if (decision.kind !== "terminate") {
			throw new Error("Expected a terminal Session decision.");
		}
		const cause = new Error("remote terminal");

		decision.plan.commit(cause);

		expect(prepared.transitions.at(-1)).toEqual({
			type: "closed",
			reason: RpcCloseReasonEnum.remoteTerminated,
			cause,
		});
		expect(prepared.onTerminal).toHaveBeenCalledTimes(1);
		expect(() => decision.plan.commit(cause)).toThrow(
			"Default RPC Session termination plan is unknown or already consumed.",
		);
		expect(prepared.onTerminal).toHaveBeenCalledTimes(1);
	});

	it("rejects a terminal plan superseded by a higher resume attempt", () => {
		const prepared = createSession("superseded");
		enterRecovery(prepared.session, prepared.sessionHost);
		const decision = prepared.session.beginResume().review({
			kind: "continuity-failure",
		});
		if (decision.kind !== "terminate") {
			throw new Error("Expected a terminal Session decision.");
		}
		prepared.session.beginResume();

		expect(() => decision.plan.commit()).toThrow(
			"Default RPC Session termination plan became stale.",
		);
		expect(prepared.session.reclaimDeadline).toBeTypeOf("number");
		expect(prepared.onTerminal).not.toHaveBeenCalled();
		prepared.session.terminateForced();
	});
});
