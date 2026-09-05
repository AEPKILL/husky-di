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
import { createRpcSessionCallRetention } from "../../src/factories/rpc-session-call-retention.factory";
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

function createSession(sessionId: string): Readonly<{
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
				createCallRetention: createRpcSessionCallRetention,
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
	it("RPC-SPI-004 keeps preparation identity-free until start", async () => {
		const { session, sent } = createRpcDirectSessionHarness();
		const finishes: unknown[] = [];
		const outgoingOrdinal = session._nextOutgoingCallOrdinal;
		const outgoingSequence = session._nextOutgoingSequence;
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
		const [entry] = session._invocations;
		if (entry === undefined) {
			throw new Error("Expected one Pending Invocation entry.");
		}

		expect({
			admitted: entry.admitted,
			callId: entry.callId,
			finishes,
			outgoingCalls: session._outgoingCalls.size,
			outgoingOrdinal: session._nextOutgoingCallOrdinal,
			outgoingSequence: session._nextOutgoingSequence,
			replay: session._callRetention.replayCount,
			sent: sent.length,
			started: entry.started,
		}).toEqual({
			admitted: false,
			callId: undefined,
			finishes: [],
			outgoingCalls: 0,
			outgoingOrdinal,
			outgoingSequence,
			replay: 0,
			sent: 0,
			started: false,
		});

		invocation.start();
		await vi.waitFor(() => expect(sent).toHaveLength(1));
		expect(entry).toMatchObject({ admitted: true, callId: "1", started: true });
		expect(session._outgoingCalls.get("1")).toBe(entry);
		expect(session._callRetention.replayCount).toBe(1);
		expect(session._nextOutgoingCallOrdinal).toBe(outgoingOrdinal + 1);
		expect(session._nextOutgoingSequence).toBe(outgoingSequence + 1);
		expect(finishes).toEqual([]);
		session.forceClose();
	});

	it("RPC-SPI-004 keeps start inert after canceling a Pending Invocation", () => {
		const { session, sent, faults } = createRpcDirectSessionHarness();
		const finishes: unknown[] = [];
		const invocation = session.prepareInvocation(
			{
				service: "example.canceled-prepare.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			},
			(outcome) => finishes.push(outcome),
		);
		if (invocation === undefined) {
			throw new Error("Expected Pending Invocation capacity.");
		}
		const [entry] = session._invocations;
		if (entry === undefined) {
			throw new Error("Expected one Pending Invocation entry.");
		}

		invocation.cancel();
		invocation.start();

		expect(finishes).toEqual([
			{
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.canceled,
			},
		]);
		expect({
			faults,
			invocations: session._invocations.size,
			sent: sent.length,
			started: entry.started,
			retired: entry.retired,
		}).toEqual({
			faults: [],
			invocations: 0,
			sent: 0,
			started: false,
			retired: true,
		});
		session.forceClose();
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
