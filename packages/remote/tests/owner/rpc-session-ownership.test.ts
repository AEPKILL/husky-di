/**
 * @overview Verifies rpc session ownership.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import type { RpcEvent } from "../../src/modules/owner";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
} from "../../src/modules/protocol";
import {
	RpcProtocolSessionTransitionTypeEnum,
	registerRpcSessionRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import {
	attachConnector,
	collectEvents,
	createConnectorHarness,
	createSession,
	publishPeerState,
} from "./ownership/test.utils";

describe("Connector Session ownership", () => {
	it("owns provisional attachment, stable Peer identity, and retained-byte routing", () => {
		const harness = createConnectorHarness();
		const peer = harness.ownership.peer;
		const forceClose = vi.fn();
		const session = createSession(forceClose);
		const sessionReservation: IRpcRetainedBytesReservation = {
			release: vi.fn(),
		};
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		expect(harness.ownership.attach({} as IRpcProtocolSession)).toBeUndefined();
		const attachment = harness.ownership.attach(session);
		expect(attachment).toBeDefined();
		expect(harness.ownership.attach(createSession())).toBeUndefined();
		expect(harness.ownership.attached).toBe(true);
		expect(construction.getSession()).toBeUndefined();
		registerRpcSessionRetainedBytes(session, () => sessionReservation);
		expect(construction.reserveRetainedBytes(3)).toBe(sessionReservation);
		unregisterRpcSessionRetainedBytes(session);

		attachment?.discard();
		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.ownership.attached).toBe(false);
		expect(harness.ownership.peer).toBe(peer);
		expect(construction.reserveRetainedBytes(2)).toBe(harness.ownerReservation);
		expect(harness.ownerReservedBytes).toEqual([2]);
	});

	it("atomically activates visibility and publishes the connected lifecycle", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const observations: string[] = [];
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		harness.ownership.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.connected) {
				observations.push(
					`state:connected:visible=${String(construction.getSession() === session)}`,
				);
			}
		});
		harness.publisher.event$.subscribe((event) =>
			observations.push(
				`event:${event.type}:state=${harness.ownership.peer.state.status}:visible=${String(construction.getSession() === session)}`,
			),
		);
		publishPeerState(harness.publisher, harness.ownership.peer, {
			status: RpcStateStatusEnum.connecting,
		});

		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected a provisional attachment.");
		}
		expect(construction.getSession()).toBeUndefined();
		expect(attachment.activate(() => true)).toBe(true);
		expect(attachment.active).toBe(true);
		expect(construction.getSession()).toBe(session);
		expect(harness.ownership.peer.state.status).toBe(
			RpcStateStatusEnum.connected,
		);
		expect(observations).toEqual([
			"state:connected:visible=true",
			`event:${RpcEventTypeEnum.peerOpened}:state=${RpcStateStatusEnum.connected}:visible=true`,
		]);
	});

	it("rejects a stale activation gate without exposing or publishing the Session", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const events: RpcEvent[] = [];
		const construction = harness.peerConstructions[0];
		if (construction === undefined) {
			throw new Error("Expected one stable Peer construction.");
		}
		harness.publisher.event$.subscribe((event) => events.push(event));
		publishPeerState(harness.publisher, harness.ownership.peer, {
			status: RpcStateStatusEnum.connecting,
		});
		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected a provisional attachment.");
		}

		expect(attachment.activate(() => false)).toBe(false);
		expect(attachment.active).toBe(false);
		expect(construction.getSession()).toBeUndefined();
		expect(harness.ownership.peer.state.status).toBe(
			RpcStateStatusEnum.connecting,
		);
		expect(events).toEqual([]);

		attachment.discard();
		expect(attachment.activate(() => true)).toBe(false);
		expect(harness.ownership.attached).toBe(false);
	});

	it("drives terminal release, publication, notification, and cleanup order", () => {
		const harness = createConnectorHarness();
		const events: RpcEvent[] = [];
		const session = createSession();
		const host = attachConnector(harness, session);
		harness.publisher.event$.subscribe((event) => {
			collectEvents(events, event);
			harness.actions.push(
				`event:${event.type}:attached=${String(harness.ownership.attached)}`,
			);
		});

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		expect(harness.ownership.attached).toBe(false);
		expect(harness.publisher.state.status).toBe(RpcStateStatusEnum.closing);
		expect(harness.ownership.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		expect(events.map(({ type }) => type)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		expect(harness.actions).toEqual([
			"termination",
			"abort-attempt",
			`event:${RpcEventTypeEnum.peerClosed}:attached=false`,
			`event:${RpcEventTypeEnum.ownerClosing}:attached=false`,
			"cleanup",
		]);
	});

	it("projects and fences a recursive invalid-transition fault inside the adapter", () => {
		const harness = createConnectorHarness();
		let host: IRpcProtocolSessionHost | undefined;
		const forceClose = vi.fn(() =>
			host?.fault(RpcCloseReasonEnum.protocolFault, new Error("recursive")),
		);
		const session = createSession(forceClose);
		host = attachConnector(harness, session);

		host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});

		expect(forceClose).toHaveBeenCalledOnce();
		expect(harness.ownership.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: { code: RpcExceptionCodeEnum.protocol },
		});
	});

	it("projects a provisional fault before delegating attempt failure", () => {
		const harness = createConnectorHarness();
		const session = createSession();
		const attachment = harness.ownership.attach(session);
		if (attachment === undefined) {
			throw new Error("Expected provisional attachment.");
		}

		attachment.host.fault(
			RpcCloseReasonEnum.resourceFault,
			new Error("resource"),
		);

		expect(harness.actions).toEqual([
			`fail-provisional:${RpcExceptionCodeEnum.protocol}`,
		]);
		expect(harness.ownership.attached).toBe(false);
	});
});
