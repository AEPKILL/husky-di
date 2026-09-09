/**
 * @overview Verifies rpc acceptor session ownership.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import type { RpcEvent } from "../../src/modules/owner";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../src/modules/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import {
	admitAcceptor,
	collectEvents,
	createAcceptorHarness,
	createSession,
} from "./ownership/test.utils";

describe("Acceptor Session ownership", () => {
	it("atomically admits unique Sessions within capacity and publishes membership first", () => {
		const harness = createAcceptorHarness(1);
		const observations: string[] = [];
		harness.publisher.event$.subscribe((event) =>
			observations.push(
				`${event.type}:peers=${harness.publisher.peers.length}`,
			),
		);
		const session = createSession();

		expect(harness.ownership.admit({} as IRpcProtocolSession)).toBeUndefined();
		expect(harness.ownership.admit(session)).toBeDefined();
		expect(harness.ownership.admit(session)).toBeUndefined();
		expect(harness.ownership.admit(createSession())).toBeUndefined();
		expect(harness.publisher.peers).toHaveLength(1);
		expect(harness.peerConstructions[0]?.getSession()).toBe(session);
		expect(observations).toEqual([`${RpcEventTypeEnum.peerOpened}:peers=1`]);
	});

	it("owns recovery, terminal membership release, and one stale-session cutoff", () => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => collectEvents(events, event));
		const forceClose = vi.fn();
		const session = createSession(forceClose);
		const host = admitAcceptor(harness, session);
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		host.transition({ type: RpcProtocolSessionTransitionTypeEnum.recovered });
		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		host.fault(RpcCloseReasonEnum.protocolFault, new Error("late"));

		expect(harness.publisher.peers).toEqual([]);
		expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
		expect(forceClose).toHaveBeenCalledOnce();
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerOpened,
			RpcEventTypeEnum.peerRecovering,
			RpcEventTypeEnum.peerRecovered,
			RpcEventTypeEnum.peerClosed,
		]);
	});

	it("fences recursive Session faults and keeps the fault at the smallest scope", () => {
		const harness = createAcceptorHarness();
		let host: IRpcProtocolSessionHost | undefined;
		const forceClose = vi.fn(() =>
			host?.fault(RpcCloseReasonEnum.protocolFault, new Error("recursive")),
		);
		const session = createSession(forceClose);
		host = admitAcceptor(harness, session);
		const peer = harness.publisher.peers[0];

		host.fault(RpcCloseReasonEnum.protocolFault, new Error("primary"));

		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.active);
		expect(harness.publisher.peers).toEqual([]);
		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: { code: RpcExceptionCodeEnum.protocol },
		});
	});

	it("fences all Sessions while a shared Protocol fault closes the topology", () => {
		const harness = createAcceptorHarness();
		admitAcceptor(harness, createSession());
		admitAcceptor(harness, createSession());
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => {
			events.push(event);
			harness.actions.push(
				`event:${event.type}:peers=${harness.publisher.peers.length}`,
			);
		});

		harness.ownership.protocolFault(
			RpcCloseReasonEnum.protocolFault,
			new Error("shared"),
		);

		expect(harness.protocol.close).toHaveBeenCalledOnce();
		expect(harness.publisher.peers).toEqual([]);
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.closing);
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		expect(harness.actions).toEqual([
			"termination",
			"abort-listener",
			`event:${RpcEventTypeEnum.peerClosed}:peers=0`,
			`event:${RpcEventTypeEnum.peerClosed}:peers=0`,
			`event:${RpcEventTypeEnum.ownerClosing}:peers=0`,
			"cleanup",
		]);
	});

	it("cuts off recovering Sessions before notifying graceful shutdown", () => {
		const harness = createAcceptorHarness();
		const recoveringForceClose = vi.fn();
		admitAcceptor(harness, createSession());
		const recoveringHost = admitAcceptor(
			harness,
			createSession(recoveringForceClose),
		);
		recoveringHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		harness.ownership.beginGracefulShutdown();

		expect(recoveringForceClose).toHaveBeenCalledOnce();
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.draining);
		expect(harness.publisher.peers).toHaveLength(1);
		expect(harness.publisher.peers[0]?.state).toMatchObject({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		expect(harness.actions).toEqual(["abort-listener", "continue-grace"]);
	});
});
