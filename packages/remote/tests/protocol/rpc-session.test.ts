/**
 * @overview Verifies rpc session.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import type { RpcHandlerOutcome } from "../../src/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RpcCallTerminalTypeEnum,
	RpcEndpointFailureEnum,
	RpcIncomingCallKindEnum,
} from "../../src/modules/protocol";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import {
	codec,
	createEndpoint,
	createSession,
	enterRecovery,
	policy,
} from "./session/test.utils";

describe("Default RPC Session authority plans", () => {
	it.each([
		"semantic",
		"projection",
		"notification",
		"direct-close",
	] as const)("preserves terminal tail guarantees when a private %s collaborator throws", async (phase) => {
		const { session, sessionHost, onTerminal } = createSession(
			`throw-${phase}`,
		);
		const error = new Error(`Private ${phase} contract violation.`);
		const endpoint = createEndpoint();
		endpoint.fenceAndClose = vi.fn(() => {
			if (phase === "direct-close") throw error;
		});
		const transition = vi.fn(() => {
			if (phase === "projection") throw error;
		});
		if (phase === "notification")
			onTerminal.mockImplementation(() => {
				throw error;
			});
		const binding = session
			.prepareFresh({ ...sessionHost, transition })
			.install(endpoint);
		expect(binding.activate()).toBe(true);
		const finish = vi.fn(() => {
			if (phase === "semantic") throw error;
		});
		const invocation = session.prepareInvocation(
			{
				service: "example.throwing-collaborator.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			},
			finish,
		);
		expect(invocation).toBeDefined();
		invocation?.start();
		const task = session.shutdown();
		const receiveClose = () => binding.receive(codec.encode({ kind: "close" }));
		if (phase === "direct-close") expect(receiveClose).not.toThrow();
		else expect(receiveClose).toThrow(error);
		await task;
		session.forceClose();
		expect(endpoint.fenceAndClose).toHaveBeenCalledTimes(1);
		expect(transition).toHaveBeenCalledTimes(1);
		expect(onTerminal).toHaveBeenCalledTimes(1);
		expect(finish).toHaveBeenCalledTimes(1);
	});

	it("RPC-SHUTDOWN-009 revokes late handler and timer work after remote terminal", async () => {
		vi.useFakeTimers();
		try {
			const { session, sessionHost, transitions, onTerminal } =
				createSession("late-handler");
			const outcome = Promise.withResolvers<RpcHandlerOutcome>();
			const finish = vi.fn();
			const endpoint = createEndpoint();
			endpoint.sendNow = vi.fn(async () => {});
			endpoint.fenceAndClose = vi.fn();
			const binding = session
				.prepareFresh({
					...sessionHost,
					reserveIncomingCall(_request, consume) {
						consume({
							kind: RpcIncomingCallKindEnum.handler,
							commit: () => ({ handlerOutcome: outcome.promise, finish }),
						});
						return true;
					},
				})
				.install(endpoint);
			expect(binding.activate()).toBe(true);
			binding.receive(
				codec.encode({
					kind: "message",
					seq: 1,
					message: {
						kind: "call",
						callId: "1",
						service: "example.late-handler.v1",
						method: "run",
						args: [],
					},
				}),
			);
			const task = session.shutdown();
			binding.receive(codec.encode({ kind: "close" }));
			await task;
			outcome.resolve({
				type: RpcCallTerminalTypeEnum.returned,
				value: normalizeRpcApplicationValue("late"),
			});
			await outcome.promise;
			await vi.advanceTimersByTimeAsync(policy.recoveryGraceMs);
			expect(endpoint.sendNow).not.toHaveBeenCalled();
			expect(endpoint.fenceAndClose).toHaveBeenCalledTimes(1);
			expect(finish).toHaveBeenCalledTimes(1);
			expect(onTerminal).toHaveBeenCalledTimes(1);
			expect(transitions).toEqual([
				{ type: "closed", reason: RpcCloseReasonEnum.remoteTerminated },
			]);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([
		"bind",
		"terminate",
		"inactive-binding",
	] as const)("RPC-RECOVERY-004 rejects a reviewed %s decision after recovery expiry", async (kind) => {
		vi.useFakeTimers();
		try {
			const { session, sessionHost, transitions, onTerminal } = createSession(
				`expiry-${kind}`,
			);
			enterRecovery(session, sessionHost);
			const decision = session.beginResume().review(
				kind === "terminate"
					? { kind: "terminated" }
					: {
							kind: "accepted",
							profile: "husky-di-rpc/1",
							sessionId: `expiry-${kind}`,
							bindingEpoch: 2,
							cursor: 0,
						},
			);
			if (decision.kind === "reject") throw decision.error;
			const installed =
				kind === "inactive-binding" && decision.kind === "bind"
					? decision.plan.install(createEndpoint())
					: undefined;
			await vi.advanceTimersByTimeAsync(policy.recoveryGraceMs);
			expect(transitions.at(-1)).toEqual({
				type: "closed",
				reason: RpcCloseReasonEnum.recoveryExpired,
			});
			if (installed !== undefined) expect(installed.activate()).toBe(false);
			else if (decision.kind === "bind")
				expect(() => decision.plan.install(createEndpoint())).toThrow(/stale/);
			else expect(() => decision.plan.commit()).toThrow(/stale/);
			session.forceClose();
			expect(onTerminal).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-SHUTDOWN-009 rechecks exact binding authority when decoding Close installs a replacement", async () => {
		let replaceBinding: (() => void) | undefined;
		const { session, sessionHost, transitions, onTerminal } = createSession(
			"close-epoch",
			undefined,
			{
				codec: {
					encode: (record) => codec.encode(record),
					decode(bytes, phase) {
						const record = codec.decode(bytes, phase);
						const replace = replaceBinding;
						replaceBinding = undefined;
						replace?.();
						return record;
					},
				},
			},
		);
		const oldEndpoint = createEndpoint();
		oldEndpoint.fenceAndClose = vi.fn();
		const initial = session.prepareFresh(sessionHost).install(oldEndpoint);
		expect(initial.activate()).toBe(true);
		const currentEndpoint = createEndpoint();
		currentEndpoint.sendNow = () => new Promise<void>(() => {});
		currentEndpoint.fenceAndClose = vi.fn();
		const replacement = session.reviewResume({
			token: "close-epoch-token",
			attempt: 1,
			cursor: 0,
		});
		if (replacement.kind !== "bind")
			throw new Error("Expected a replacement plan.");
		let current: ReturnType<typeof replacement.plan.install> | undefined;
		replaceBinding = () => {
			current = replacement.plan.install(currentEndpoint);
			expect(current.activate()).toBe(true);
		};
		initial.receive(codec.encode({ kind: "close" }));
		expect(transitions).toEqual([]);
		expect(onTerminal).not.toHaveBeenCalled();
		expect(currentEndpoint.fenceAndClose).not.toHaveBeenCalled();
		let settled = false;
		const task = session.shutdown().then(() => {
			settled = true;
		});
		initial.receive(codec.encode({ kind: "close" }));
		await Promise.resolve();
		expect(settled).toBe(false);
		current?.receive(codec.encode({ kind: "close" }));
		await task;
		expect(currentEndpoint.fenceAndClose).toHaveBeenCalledTimes(1);
		expect(transitions).toEqual([
			{ type: "closed", reason: RpcCloseReasonEnum.remoteTerminated },
		]);
		expect(onTerminal).toHaveBeenCalledTimes(1);
	});

	it("RPC-SHUTDOWN-009 keeps remote Close authoritative over duplicate triggers and a late Close-send rejection", async () => {
		const { session, sessionHost, transitions, onTerminal } =
			createSession("pending-close");
		const pending = Promise.withResolvers<void>();
		const endpoint = createEndpoint();
		endpoint.sendNow = vi.fn(() => pending.promise);
		endpoint.fenceAndClose = vi.fn();
		const binding = session.prepareFresh(sessionHost).install(endpoint);
		expect(binding.activate()).toBe(true);
		let settled = false;
		const task = session.shutdown().then(() => {
			settled = true;
		});
		expect(endpoint.sendNow).toHaveBeenCalledExactlyOnceWith(
			codec.encode({ kind: "close" }),
		);
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(endpoint.fenceAndClose).not.toHaveBeenCalled();
		binding.receive(codec.encode({ kind: "close" }));
		await task;
		binding.receive(codec.encode({ kind: "close" }));
		session.forceClose();
		pending.reject(new Error("Late Close rejection."));
		await Promise.resolve();
		expect(endpoint.fenceAndClose).toHaveBeenCalledTimes(1);
		expect(endpoint.sendNow).toHaveBeenCalledTimes(1);
		expect(onTerminal).toHaveBeenCalledTimes(1);
		expect(transitions).toEqual([
			{ type: "closed", reason: RpcCloseReasonEnum.remoteTerminated },
		]);
	});

	it.each([
		false,
		true,
	])("RPC-SPI-012 RPC-SHUTDOWN-008 Direct Closes a lost draining binding before terminal publication with counter=%s", async (counterExhausted) => {
		const { session, sessionHost, transitions, onTerminal } = createSession(
			"drain-loss",
			undefined,
			{ counterExhausted },
		);
		const order: string[] = [];
		const endpoint = createEndpoint();
		endpoint.sendNow = () => new Promise<void>(() => {});
		endpoint.fenceAndClose = vi.fn(() => order.push("direct-close"));
		const binding = session
			.prepareFresh({
				...sessionHost,
				transition(transition) {
					order.push("transition");
					sessionHost.transition(transition);
				},
			})
			.install(endpoint);
		expect(binding.activate()).toBe(true);
		if (counterExhausted) {
			const invocation = session.prepareInvocation(
				{
					service: "example.counter-loss.v1",
					method: "run",
					args: normalizeRpcApplicationArguments([]),
				},
				() => {},
			);
			expect(invocation).toBeDefined();
			invocation?.start();
			expect(transitions).toEqual([
				{ type: "draining", reason: RpcCloseReasonEnum.counterExhaustion },
			]);
			order.length = 0;
			transitions.length = 0;
		}
		const task = session.shutdown();
		const cause = new Error("Draining binding lost.");
		binding.fail(RpcEndpointFailureEnum.connection, cause);
		expect(order).toEqual(["direct-close", "transition"]);
		await task;
		expect(transitions).toEqual([
			{
				type: "closed",
				reason: counterExhausted
					? RpcCloseReasonEnum.counterExhaustion
					: RpcCloseReasonEnum.forcedClose,
				cause,
			},
		]);
		expect(onTerminal).toHaveBeenCalledTimes(1);
		expect(endpoint.fenceAndClose).toHaveBeenCalledTimes(1);
	});

	it("RPC-SPI-011 keeps Framework fault reentry as the sole projection authority", async () => {
		const { session, sessionHost, transitions, onTerminal } =
			createSession("fault-reentry");
		const endpoint = createEndpoint();
		endpoint.fenceAndClose = vi.fn();
		const fault = vi.fn(() => {
			session.forceClose();
		});
		const binding = session
			.prepareFresh({ ...sessionHost, fault })
			.install(endpoint);
		expect(binding.activate()).toBe(true);
		const finish = vi.fn(() => session.forceClose());
		const invocation = session.prepareInvocation(
			{
				service: "example.fault-reentry.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			},
			finish,
		);
		expect(invocation).toBeDefined();
		invocation?.start();
		const task = session.shutdown();
		const cause = new Error("Accepted Protocol fault.");
		binding.fail(RpcEndpointFailureEnum.protocol, cause);
		await task;
		expect(fault).toHaveBeenCalledExactlyOnceWith(
			RpcCloseReasonEnum.protocolFault,
			cause,
		);
		expect(transitions).toEqual([]);
		expect(finish).toHaveBeenCalledTimes(1);
		expect(onTerminal).toHaveBeenCalledTimes(1);
		expect(endpoint.fenceAndClose).toHaveBeenCalledTimes(1);
	});
});
