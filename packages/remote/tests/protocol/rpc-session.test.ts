/**
 * @overview Authority-plan and complete terminal lifetime tests for the built-in Logical Session.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { describe, expect, it, vi } from "vitest";

import { RpcCallTerminalTypeEnum } from "../../src/enums/protocol/rpc-call-terminal-type.enum";
import { RpcEndpointFailureEnum } from "../../src/enums/protocol/rpc-endpoint-failure.enum";
import { RpcIncomingCallKindEnum } from "../../src/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcCloseReasonEnum } from "../../src/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { createRpcSessionActivity } from "../../src/factories/rpc-session-activity.factory";
import { createRpcSessionCallRetention } from "../../src/factories/rpc-session-call-retention.factory";
import { createRpcSessionIncomingCalls } from "../../src/factories/rpc-session-incoming-calls.factory";
import { createRpcSessionInvocations } from "../../src/factories/rpc-session-invocations.factory";
import { RpcRetainedBytesLedgerImpl } from "../../src/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import { RpcSessionImpl } from "../../src/impls/session/rpc-session.impl";
import type { IRpcEndpoint } from "../../src/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcCodec } from "../../src/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSessionHost,
	RpcHandlerOutcome,
	RpcProtocolSessionTransition,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcSessionActivity,
	RpcSessionActivityFactory,
} from "../../src/interfaces/session/rpc-session-activity.interface";
import {
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	rpcApplicationValuesEqual,
} from "../../src/utils/rpc-application-value.util";
import { createRpcDirectSessionHarness } from "./test.utils";

const policy: IRpcProtocolRuntimePolicy = {
	maxSessions: 2,
	maxHandshakes: 2,
	maxPendingInvocationsPerSession: 8,
	maxRetainedBytesPerSession: 1024 * 1024,
	maxRetainedBytesTotal: 2 * 1024 * 1024,
	maxHandlersPerSession: 2,
	maxHandlersTotal: 4,
	ackDelayMs: 50,
	activityProbeIntervalMs: 30_000,
	silenceTimeoutMs: 120_000,
	sendProgressTimeoutMs: 30_000,
	bindingAttemptTimeoutMs: 30_000,
	recoveryGraceMs: 300_000,
	shutdownDeadlineMs: 5_000,
};

const codec = new RpcCodecImpl();

function createSession(
	sessionId: string,
	createActivity: RpcSessionActivityFactory = createRpcSessionActivity,
	options: {
		readonly codec?: IRpcCodec;
		readonly counterExhausted?: boolean;
	} = {},
): Readonly<{
	readonly session: RpcSessionImpl;
	readonly sessionHost: IRpcProtocolSessionHost;
	readonly transitions: RpcProtocolSessionTransition[];
	readonly onTerminal: ReturnType<typeof vi.fn<() => void>>;
	readonly ownerReservationReleases: readonly ReturnType<
		typeof vi.fn<() => void>
	>[];
}> {
	const ownerLedger = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const ownerReservationReleases: ReturnType<typeof vi.fn<() => void>>[] = [];
	const host: IRpcProtocolHost = {
		policy,
		reserveRetainedBytes(bytes) {
			const reservation = ownerLedger.reserve(bytes);
			if (reservation === undefined) return undefined;
			const release = vi.fn(() => reservation.release());
			ownerReservationReleases.push(release);
			return Object.freeze({ release });
		},
		normalizeApplicationValue: normalizeRpcApplicationValue,
		normalizeApplicationArguments: normalizeRpcApplicationArguments,
		applicationValuesEqual: rpcApplicationValuesEqual,
		fault() {},
	};
	const transitions: RpcProtocolSessionTransition[] = [];
	const onTerminal = vi.fn<() => void>();
	return {
		session: new RpcSessionImpl(
			{
				host,
				sessionId,
				resumeToken: `${sessionId}-token`,
				onTerminal,
			},
			{
				codec: options.codec ?? codec,
				counterExhausted: options.counterExhausted,
				createActivity,
				createCallRetention: createRpcSessionCallRetention,
				createIncomingCalls: createRpcSessionIncomingCalls,
				createInvocations: createRpcSessionInvocations,
				retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
					policy.maxRetainedBytesPerSession,
				),
			},
		),
		sessionHost: {
			reserveIncomingCall: () => false,
			transition: (transition) => transitions.push(transition),
			fault() {},
		},
		transitions,
		onTerminal,
		ownerReservationReleases,
	};
}

function createEndpoint(): IRpcEndpoint {
	return {
		isSendIdle: true,
		isIngressIdle: true,
		configureSendProgressTimeout() {},
		observeIngressIdle() {},
		async sendNow() {},
		fenceAndClose() {},
	};
}

function enterRecovery(
	session: RpcSessionImpl,
	sessionHost: IRpcProtocolSessionHost,
): void {
	const binding = session.prepareFresh(sessionHost).install(createEndpoint());
	if (!binding.activate()) {
		throw new Error("Expected the fresh Session binding to activate.");
	}
	binding.fail(RpcEndpointFailureEnum.connection);
}

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
