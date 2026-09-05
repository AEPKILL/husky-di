/**
 * @overview Focused authority-plan tests for the built-in Logical Session.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import { describe, expect, it, vi } from "vitest";

import { RpcCallTerminalTypeEnum } from "../../src/enums/protocol/rpc-call-terminal-type.enum";
import { RpcEndpointFailureEnum } from "../../src/enums/protocol/rpc-endpoint-failure.enum";
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
import type {
	IRpcProtocolHost,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSessionHost,
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
): Readonly<{
	readonly session: RpcSessionImpl;
	readonly sessionHost: IRpcProtocolSessionHost;
	readonly transitions: RpcProtocolSessionTransition[];
	readonly onTerminal: ReturnType<typeof vi.fn<() => void>>;
}> {
	const ownerLedger = new RpcRetainedBytesLedgerImpl(
		policy.maxRetainedBytesTotal,
	);
	const host: IRpcProtocolHost = {
		policy,
		reserveRetainedBytes: (bytes) => ownerLedger.reserve(bytes),
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
				codec,
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
