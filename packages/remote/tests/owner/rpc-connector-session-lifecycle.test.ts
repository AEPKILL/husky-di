/**
 * @overview Behavioral coverage of Connector Session attachment and terminal authority.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { describe, expect, it } from "vitest";
import { createRpcConnectorLifecycleState } from "../../src/modules/owner";
import {
	type IRpcProtocolSessionLifecycle,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import { createRpcLifecycleFixture } from "../resources/rpc-lifecycle.util";

describe("Connector Session lifecycle", () => {
	it("binds the creation dependencies once without freezing supplied instances", () => {
		const fixture = createRpcLifecycleFixture();
		const peer = fixture.lifecycle.peer;
		const owner = fixture.options.owner;
		expect(fixture.peerViews).toEqual([fixture.state.peerStateView]);
		expect(fixture.peerViews[0]).toBe(fixture.state.peerStateView);
		expect(Object.isFrozen(owner)).toBe(false);
		expect(Object.isFrozen(fixture.state)).toBe(false);
		expect(Object.isFrozen(peer)).toBe(false);
		fixture.options.state = createRpcConnectorLifecycleState();
		fixture.options.owner = {
			beginClosing: () => {
				throw new Error("Replaced Owner.");
			},
			failAttachment: () => {},
		};
		fixture.options.createPeer = () => {
			throw new Error("Replaced Peer factory.");
		};
		fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true);
		expect(fixture.closings).toHaveLength(1);
		expect(fixture.state.state.status).toBe(RpcStateStatusEnum.closing);
		expect(fixture.options.state.state.status).toBe(RpcStateStatusEnum.active);
		expect(fixture.peerViews).toHaveLength(1);
		expect(fixture.lifecycle.peer).toBe(peer);
	});

	it("rechecks attachment identity after the activation guard discards and replaces it", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const first = fixture.attach(session);
		let replacement: ReturnType<typeof fixture.attach> | undefined;
		const committed = first.activate(() => {
			first.discard();
			replacement = fixture.attach(new TestSession());
			return true;
		});
		expect(committed).toBe(false);
		expect(first.active).toBe(false);
		expect(session.closeCount).toBe(1);
		expect(replacement?.activate(() => true)).toBe(true);
		let guardRead = false;
		expect(
			first.activate(() => {
				guardRead = true;
				return true;
			}),
		).toBe(false);
		expect(guardRead).toBe(false);
	});

	it("does not activate after a guard begins shutdown, and preserves a commit closed by an observer", () => {
		const before = createRpcLifecycleFixture();
		const first = before.attach(new TestSession());
		expect(
			first.activate(() => {
				before.lifecycle.beginGracefulShutdown();
				return true;
			}),
		).toBe(false);
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const second = fixture.attach(session);
		fixture.lifecycle.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.connected)
				fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true);
		});
		expect(second.activate(() => true)).toBe(true);
		expect(second.active).toBe(false);
		expect(session.closed).toBe(true);
		expect(second.activate(() => true)).toBe(false);
		expect(fixture.lifecycle.peer.state.status).toBe(RpcStateStatusEnum.closed);
	});

	it.each([
		true,
		false,
	])("publishes the selected terminal even when a closing effect throws (Owner: %s)", (ownerThrows) => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		fixture.attach(session).activate(() => true);
		const error = new Error("Closing effect failed.");
		if (ownerThrows)
			fixture.options.owner.beginClosing = () => {
				throw error;
			};
		else
			session.onForceClose = () => {
				throw error;
			};
		expect(() =>
			fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true),
		).toThrow(error);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.forcedClose,
		});
		expect(fixture.state.state.status).toBe(RpcStateStatusEnum.closing);
		expect(session.closeCount).toBe(1);
		expect(() =>
			fixture.lifecycle.beginClosing(RpcCloseReasonEnum.shutdownDeadline, true),
		).not.toThrow();
		expect(session.closeCount).toBe(1);
	});

	it.each([
		RpcProtocolSessionTransitionTypeEnum.closed,
		RpcProtocolSessionTransitionTypeEnum.recovering,
	] as const)("fails only the provisional attempt on %s", (type) => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(attachment.active).toBe(false);
		expect(fixture.lifecycle.peer.state.status).toBe(
			RpcStateStatusEnum.connecting,
		);
		const cause = new Error("Provisional binding ended.");
		attachment.host.transition(
			type === RpcProtocolSessionTransitionTypeEnum.closed
				? { type, reason: RpcCloseReasonEnum.remoteTerminated, cause }
				: { type, cause },
		);
		expect(fixture.failures[0]?.error).toMatchObject({
			code: RpcExceptionCodeEnum.unavailable,
			cause,
		});
		expect(fixture.lifecycle.peer.state.status).toBe(
			RpcStateStatusEnum.unbound,
		);
		expect(fixture.state.state.status).toBe(RpcStateStatusEnum.active);
		expect(session.closeCount).toBe(1);
		expect(fixture.closings).toEqual([]);
	});

	it("commits the graceful cutoff before observers and forces a lost draining binding", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.activate(() => true);
		const snapshots: RpcStateStatusEnum[] = [];
		fixture.state.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining)
				snapshots.push(fixture.lifecycle.peer.state.status);
		});
		fixture.lifecycle.beginGracefulShutdown();
		fixture.lifecycle.beginGracefulShutdown();
		expect(snapshots).toEqual([RpcStateStatusEnum.draining]);
		expect(fixture.lifecycle.peer.state).toEqual({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		expect(session.closeCount).toBe(0);
		expect(fixture.lifecycle.attach(new TestSession())).toBeUndefined();
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(session.closeCount).toBe(1);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.forcedClose,
		});
	});

	it("keeps counter-draining work eligible for graceful completion", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.activate(() => true);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		fixture.lifecycle.beginGracefulShutdown();
		expect(fixture.lifecycle.peer.state).toEqual({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		fixture.lifecycle.beginClosing(RpcCloseReasonEnum.gracefulShutdown, false);
		expect(session.closeCount).toBe(0);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
	});

	it("gracefully terminates an unbound Owner and rejects a provisional activation after cutoff", () => {
		const empty = createRpcLifecycleFixture();
		empty.lifecycle.beginGracefulShutdown();
		expect(empty.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		fixture.lifecycle.beginGracefulShutdown();
		expect(attachment.activate(() => true)).toBe(false);
		expect(session.closeCount).toBe(1);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
	});

	it("forces an already recovering Session at graceful cutoff", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.activate(() => true);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		fixture.lifecycle.beginGracefulShutdown();
		expect(session.closeCount).toBe(1);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.forcedClose,
		});
	});

	it("recovers the retained attachment and restores counter-draining intent", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		const peer = fixture.lifecycle.peer;
		attachment.activate(() => true);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(peer.state).toEqual({ status: RpcStateStatusEnum.recovering });
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(peer.state).toEqual({ status: RpcStateStatusEnum.connected });
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(peer.state).toEqual({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});
		expect(fixture.lifecycle.peer).toBe(peer);
		expect(attachment.active).toBe(true);
		expect(fixture.lifecycle.attach(new TestSession())).toBeUndefined();
		expect(session.closeCount).toBe(0);
	});

	it.each([
		[RpcCloseReasonEnum.gracefulShutdown, undefined],
		[RpcCloseReasonEnum.forcedClose, undefined],
		[RpcCloseReasonEnum.remoteTerminated, undefined],
		[RpcCloseReasonEnum.recoveryExpired, RpcExceptionCodeEnum.unavailable],
		[RpcCloseReasonEnum.counterExhaustion, RpcExceptionCodeEnum.unavailable],
		[RpcCloseReasonEnum.continuityFailure, RpcExceptionCodeEnum.protocol],
	] as const)("projects Protocol terminal %s without repeating semantic termination", (reason, code) => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.activate(() => true);
		const cause = new Error("Protocol terminal cause.");
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason,
			cause,
		});
		const terminal = fixture.lifecycle.peer.state;
		expect(terminal).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason,
			outcome:
				code === undefined
					? RpcCloseOutcomeEnum.normal
					: RpcCloseOutcomeEnum.failed,
		});
		if (code === undefined) expect(terminal).not.toHaveProperty("error");
		else expect(terminal).toMatchObject({ error: { code, cause } });
		expect(fixture.closings[0]?.forced).toBe(false);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true);
		expect(fixture.lifecycle.peer.state).toBe(terminal);
		expect(session.closeCount).toBe(0);
		expect(fixture.closings).toHaveLength(1);
	});

	it.each([
		RpcCloseReasonEnum.protocolFault,
		RpcCloseReasonEnum.resourceFault,
	] as const)("scopes %s to the provisional attempt and fences its late notifications", (reason) => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		const cause = new Error("Invalid Session behavior.");
		attachment.host.fault(reason, cause);
		expect(session.closed).toBe(true);
		expect(fixture.failures).toHaveLength(1);
		expect(fixture.failures[0]?.attachment).toBe(attachment);
		expect(fixture.failures[0]?.error).toMatchObject({
			code: RpcExceptionCodeEnum.protocol,
			cause,
		});
		expect(fixture.state.state.status).toBe(RpcStateStatusEnum.active);
		expect(fixture.lifecycle.peer.state.status).toBe(
			RpcStateStatusEnum.unbound,
		);
		const replacement = fixture.attach(new TestSession());
		expect(replacement.activate(() => true)).toBe(true);
		attachment.host.fault(reason, cause);
		attachment.host.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		expect(fixture.failures).toHaveLength(1);
		expect(session.closeCount).toBe(1);
		expect(replacement.active).toBe(true);
		expect(fixture.closings).toEqual([]);
	});

	it("selects an active Session fault before reentrant forceClose notifications", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		attachment.activate(() => true);
		const cause = new Error("Bad protocol record.");
		session.onForceClose = () => {
			attachment.host.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});
			fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true);
		};
		attachment.host.fault(RpcCloseReasonEnum.protocolFault, cause);
		expect(fixture.lifecycle.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: { code: RpcExceptionCodeEnum.protocol, cause },
		});
		expect(session.closeCount).toBe(1);
		expect(fixture.closings).toHaveLength(1);
		expect(fixture.closings[0]?.forced).toBe(true);
	});

	it("revokes authority and forces the exact Session before publishing the first terminal", () => {
		const fixture = createRpcLifecycleFixture();
		const session = new TestSession();
		const attachment = fixture.attach(session);
		expect(attachment.activate(() => true)).toBe(true);
		const observed: boolean[] = [];
		fixture.lifecycle.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.closed) {
				observed.push(
					session.closed && !attachment.active && !fixture.lifecycle.attached,
				);
			}
		});
		fixture.lifecycle.beginClosing(RpcCloseReasonEnum.forcedClose, true);
		fixture.lifecycle.beginClosing(RpcCloseReasonEnum.shutdownDeadline, true);
		attachment.discard();
		expect(observed).toEqual([true]);
		expect(session.closeCount).toBe(1);
		expect(fixture.closings).toEqual([
			{
				state: {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
				},
				forced: true,
			},
		]);
		expect(fixture.state.state).toEqual({ status: RpcStateStatusEnum.closing });
		expect(fixture.lifecycle.peer.state).toEqual(fixture.closings[0]?.state);
		expect(fixture.lifecycle.attach(new TestSession())).toBeUndefined();
	});
});

class TestSession implements IRpcProtocolSessionLifecycle {
	closed = false;
	closeCount = 0;
	onForceClose: (() => void) | undefined;
	forceClose(): void {
		this.closed = true;
		this.closeCount++;
		this.onForceClose?.();
	}
}
