/**
 * @overview Verifies rpc session binding.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "../../src/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	RpcCallTerminalTypeEnum,
} from "../../src/modules/protocol";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import {
	codec,
	createEndpoint,
	createSession,
	enterRecovery,
	policy,
} from "./session/test.utils";

describe("Default RPC Session authority plans", () => {
	it("RPC-RECOVERY-004 keeps an activated replacement authoritative after the original recovery deadline", async () => {
		vi.useFakeTimers();
		try {
			const { session, sessionHost, transitions, onTerminal } =
				createSession("activation-winner");
			enterRecovery(session, sessionHost);
			const decision = session.beginResume().review({
				kind: "accepted",
				profile: "husky-di-rpc/1",
				sessionId: "activation-winner",
				bindingEpoch: 2,
				cursor: 0,
			});
			if (decision.kind !== "bind")
				throw new Error("Expected a valid replacement.");
			const binding = decision.plan.install(createEndpoint());
			await vi.advanceTimersByTimeAsync(policy.recoveryGraceMs - 1);
			expect(binding.activate()).toBe(true);
			await vi.advanceTimersByTimeAsync(1);
			expect(transitions).toEqual([
				{ type: "recovering", cause: undefined },
				{ type: "recovered" },
			]);
			expect(onTerminal).not.toHaveBeenCalled();
			session.forceClose();
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-SPI-012 RPC-SHUTDOWN-009 completes the remote terminal winner before shutdown reactions under force reentry", async () => {
		const {
			session,
			sessionHost,
			transitions,
			onTerminal,
			ownerReservationReleases,
		} = createSession("remote-terminal");
		const endpoint = createEndpoint();
		const order: string[] = [];
		endpoint.fenceAndClose = vi.fn(() => order.push("direct-close"));
		const binding = session.prepareFresh(sessionHost).install(endpoint);
		expect(binding.activate()).toBe(true);
		const finish = vi.fn(() => {
			order.push("call-terminal");
			session.forceClose();
		});
		const invocation = session.prepareInvocation(
			{
				service: "example.remote-terminal.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			},
			finish,
		);
		expect(invocation).toBeDefined();
		invocation?.start();
		let settled = false;
		void session.shutdown().then(() => {
			settled = true;
			order.push("shutdown");
		});
		binding.receive(codec.encode({ kind: "close" }));
		expect(order).toEqual(["call-terminal", "direct-close"]);
		await Promise.resolve();
		expect(settled).toBe(true);
		expect(order).toEqual(["call-terminal", "direct-close", "shutdown"]);
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.outcomeUnknown,
		});
		expect(transitions).toEqual([
			{ type: "closed", reason: RpcCloseReasonEnum.remoteTerminated },
		]);
		expect(onTerminal).toHaveBeenCalledTimes(1);
		expect(session.reserveRetainedBytes(1)).toBeUndefined();
		expect(ownerReservationReleases.length).toBeGreaterThan(0);
		for (const release of ownerReservationReleases)
			expect(release).toHaveBeenCalledTimes(1);
	});

	it("RPC-SESSION-011 RPC-RECOVERY-005 RPC-VALID-002 scopes Activity Probe ownership to the activated current binding", () => {
		const activities: {
			readonly options: Parameters<RpcSessionActivityFactory>[0];
			readonly activity: IRpcSessionActivity;
		}[] = [];
		const createActivity: RpcSessionActivityFactory = (options) => {
			const activity: IRpcSessionActivity = {
				hasPendingProbe: false,
				start: vi.fn(),
				recordInbound: vi.fn(),
				takeProbe: vi.fn(() => undefined),
				stop: vi.fn(),
			};
			activities.push({ options, activity });
			return activity;
		};
		const { session, sessionHost, transitions } = createSession(
			"activity-lifetime",
			createActivity,
		);
		const initial = session.prepareFresh(sessionHost).install(createEndpoint());
		expect(activities).toHaveLength(0);
		expect(initial.activate()).toBe(true);
		expect(initial.activate()).toBe(false);
		const first = activities[0];
		if (first === undefined) {
			throw new Error("Expected activity for the first activated binding.");
		}
		expect(first.activity.start).toHaveBeenCalledTimes(1);

		const replacement = session.reviewResume({
			token: "activity-lifetime-token",
			attempt: 1,
			cursor: 0,
		});
		if (replacement.kind !== "bind") {
			throw new Error("Expected a replacement binding plan.");
		}
		const current = replacement.plan.install(createEndpoint());
		expect(first.activity.stop).toHaveBeenCalledTimes(1);
		expect(activities).toHaveLength(1);
		first.options.onProbeDue();
		first.options.onSilent();
		expect(transitions).toEqual([]);
		expect(current.activate()).toBe(true);
		const second = activities[1];
		if (second === undefined) {
			throw new Error("Expected activity for the replacement binding.");
		}
		expect(second.activity.start).toHaveBeenCalledTimes(1);

		const encoder = new TextEncoder();
		const validAck = encoder.encode('{"kind":"ack","ackThrough":0}');
		initial.receive(validAck);
		current.receive(encoder.encode("invalid"));
		current.receive(encoder.encode('{"kind":"ack","ackThrough":1}'));
		expect(first.activity.recordInbound).not.toHaveBeenCalled();
		expect(second.activity.recordInbound).not.toHaveBeenCalled();
		current.receive(validAck);
		expect(second.activity.recordInbound).toHaveBeenCalledExactlyOnceWith(
			"ack",
		);

		first.options.onSilent();
		expect(transitions).toEqual([]);
		second.options.onSilent();
		expect(transitions).toEqual([
			{ type: "recovering", cause: expect.any(Error) },
		]);
		expect(second.activity.stop).toHaveBeenCalledTimes(1);
		session.forceClose();
		second.options.onSilent();
		expect(transitions).toHaveLength(1);
	});
});
