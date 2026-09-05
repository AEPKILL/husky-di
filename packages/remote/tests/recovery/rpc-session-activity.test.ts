/**
 * @overview Private Activity Probe lifetime, coalescing, and authoritative silence behavior.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { createRpcSessionActivity } from "../../src/factories/rpc-session-activity.factory";
import type { IRpcSessionActivity } from "../../src/interfaces/session/rpc-session-activity.interface";

describe("binding Activity Probe", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it("stays cold until its single start and repeated starts cannot postpone a probe", () => {
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		vi.advanceTimersByTime(100);
		expect(activity.hasPendingProbe).toBe(false);
		expect(activity.takeProbe()).toBeUndefined();
		expect(onProbeDue).not.toHaveBeenCalled();
		expect(onSilent).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);

		activity.start();
		vi.advanceTimersByTime(5);
		activity.start();
		vi.advanceTimersByTime(5);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		expect(activity.takeProbe()).toBe(RpcWireRecordKindEnum.ping);
		activity.stop();
	});

	it("coalesces requests and responses, preferring a pending response without inline send notification", () => {
		const { activity, onProbeDue } = createActivity();
		activity.start();
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		expect(onProbeDue).not.toHaveBeenCalled();
		expect(activity.hasPendingProbe).toBe(true);

		vi.advanceTimersByTime(20);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		expect(activity.takeProbe()).toBe(RpcWireRecordKindEnum.pong);
		expect(activity.hasPendingProbe).toBe(true);
		expect(activity.takeProbe()).toBe(RpcWireRecordKindEnum.ping);
		expect(activity.hasPendingProbe).toBe(false);
		expect(activity.takeProbe()).toBeUndefined();
		activity.stop();
	});

	it.each([
		RpcWireRecordKindEnum.ack,
		RpcWireRecordKindEnum.message,
		RpcWireRecordKindEnum.pong,
	] as const)("validated %s cancels a pending Ping and restarts the probe and silence deadlines", (kind) => {
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.start();
		vi.advanceTimersByTime(12);
		expect(activity.hasPendingProbe).toBe(true);

		activity.recordInbound(kind);
		expect(activity.hasPendingProbe).toBe(false);
		expect(activity.takeProbe()).toBeUndefined();
		vi.advanceTimersByTime(9);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(19);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSilent).toHaveBeenCalledTimes(1);
		expect(activity.hasPendingProbe).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});

	it("a valid Ping supersedes a pending Ping with one Pong and a Pong creates no reply", () => {
		const { activity, onProbeDue } = createActivity();
		activity.start();
		vi.advanceTimersByTime(10);
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		expect(activity.takeProbe()).toBe(RpcWireRecordKindEnum.pong);
		expect(activity.takeProbe()).toBeUndefined();
		activity.recordInbound(RpcWireRecordKindEnum.pong);
		expect(activity.hasPendingProbe).toBe(false);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		activity.stop();
	});

	it("selects silence once at the deadline even when unsent probes remain pending", () => {
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.start();
		vi.advanceTimersByTime(29);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		expect(activity.hasPendingProbe).toBe(true);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSilent).toHaveBeenCalledTimes(1);
		expect(activity.takeProbe()).toBeUndefined();
		activity.start();
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		vi.advanceTimersByTime(100);
		expect(onSilent).toHaveBeenCalledTimes(1);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		expect(vi.getTimerCount()).toBe(0);
	});

	it.each([
		false,
		true,
	])("stop is final and idempotent when started=%s", (started) => {
		const { activity, onProbeDue, onSilent } = createActivity();
		if (started) {
			activity.start();
			activity.recordInbound(RpcWireRecordKindEnum.ping);
			vi.advanceTimersByTime(10);
			expect(activity.hasPendingProbe).toBe(true);
		}
		onProbeDue.mockClear();
		activity.stop();
		activity.stop();
		activity.start();
		activity.recordInbound(RpcWireRecordKindEnum.ping);
		vi.advanceTimersByTime(100);
		expect(activity.hasPendingProbe).toBe(false);
		expect(activity.takeProbe()).toBeUndefined();
		expect(onProbeDue).not.toHaveBeenCalled();
		expect(onSilent).not.toHaveBeenCalled();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("snapshots the supplied timing policy and effect callbacks at construction", () => {
		const policy = { activityProbeIntervalMs: 10, silenceTimeoutMs: 30 };
		const onProbeDue = vi.fn();
		const onSilent = vi.fn();
		const replacement = vi.fn();
		const options = { policy, onProbeDue, onSilent };
		const activity = createRpcSessionActivity(options);
		policy.activityProbeIntervalMs = 100;
		policy.silenceTimeoutMs = 300;
		options.onProbeDue = replacement;
		options.onSilent = replacement;
		activity.start();
		vi.advanceTimersByTime(30);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		expect(onSilent).toHaveBeenCalledTimes(1);
		expect(replacement).not.toHaveBeenCalled();
	});

	it("a canceled callback cannot send, condemn silence, or clear a newer timer", () => {
		const timeout = vi.spyOn(globalThis, "setTimeout");
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.start();
		const staleCallback = timeout.mock.calls[0]?.[0];
		if (typeof staleCallback !== "function") {
			throw new Error("Expected an Activity Probe timer callback.");
		}
		vi.advanceTimersByTime(5);
		activity.recordInbound(RpcWireRecordKindEnum.pong);
		vi.setSystemTime(100);
		staleCallback();
		expect(onProbeDue).not.toHaveBeenCalled();
		expect(onSilent).not.toHaveBeenCalled();
		expect(activity.hasPendingProbe).toBe(false);
		expect(vi.getTimerCount()).toBe(1);

		activity.stop();
		expect(vi.getTimerCount()).toBe(0);
		staleCallback();
		expect(onProbeDue).not.toHaveBeenCalled();
		expect(onSilent).not.toHaveBeenCalled();
	});

	it("grants one full confirmation interval after a late callback before selecting silence", () => {
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.start();
		vi.setSystemTime(100);
		vi.advanceTimersByTime(10);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		expect(activity.takeProbe()).toBe(RpcWireRecordKindEnum.ping);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(9);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSilent).toHaveBeenCalledTimes(1);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
	});

	it("does not grant stall grace when callback lateness equals the probe interval", () => {
		const { activity, onSilent } = createActivity();
		activity.start();
		vi.advanceTimersByTime(20);
		vi.setSystemTime(30);
		vi.advanceTimersByTime(9);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSilent).toHaveBeenCalledTimes(1);
	});

	it("valid activity during stall grace starts fresh activity deadlines", () => {
		const { activity, onProbeDue, onSilent } = createActivity();
		activity.start();
		vi.setSystemTime(100);
		vi.advanceTimersByTime(10);
		vi.advanceTimersByTime(5);
		activity.recordInbound(RpcWireRecordKindEnum.pong);
		expect(activity.hasPendingProbe).toBe(false);
		vi.advanceTimersByTime(9);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(1);
		expect(onProbeDue).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(19);
		expect(onSilent).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onSilent).toHaveBeenCalledTimes(1);
	});

	it.each([
		0, 100,
	])("does not reschedule after onProbeDue synchronously stops the lifetime (clock jump %s)", (clockJump) => {
		const onSilent = vi.fn();
		let activity: IRpcSessionActivity;
		const onProbeDue = vi.fn(() => {
			expect(activity.hasPendingProbe).toBe(true);
			activity.stop();
		});
		activity = createRpcSessionActivity({
			policy: { activityProbeIntervalMs: 10, silenceTimeoutMs: 30 },
			onProbeDue,
			onSilent,
		});
		activity.start();
		vi.setSystemTime(clockJump);
		vi.advanceTimersByTime(100);
		expect(onProbeDue).toHaveBeenCalledTimes(1);
		expect(onSilent).not.toHaveBeenCalled();
		expect(activity.hasPendingProbe).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});

function createActivity() {
	const onProbeDue = vi.fn();
	const onSilent = vi.fn();
	const activity = createRpcSessionActivity({
		policy: { activityProbeIntervalMs: 10, silenceTimeoutMs: 30 },
		onProbeDue,
		onSilent,
	});
	return { activity, onProbeDue, onSilent };
}
