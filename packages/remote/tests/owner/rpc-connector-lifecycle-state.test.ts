/**
 * @overview Connector lifecycle state snapshots and ordered live state streams.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { describe, expect, it } from "vitest";
import { createRpcConnectorLifecycleState } from "../../src/modules/owner";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";

describe("Connector lifecycle state", () => {
	it("starts cold with a stable live Peer view and replaying state streams", () => {
		const lifecycle = createRpcConnectorLifecycleState();
		const ownerStates: string[] = [];
		const peerStates: string[] = [];
		const ownerStream = lifecycle.state$;
		const view = lifecycle.peerStateView;
		const peerStream = view.state$;
		const readState = view.readState;
		const ownerSubscription = ownerStream.subscribe((state) =>
			ownerStates.push(state.status),
		);
		const peerSubscription = peerStream.subscribe((state) =>
			peerStates.push(state.status),
		);

		expect(lifecycle.state).toEqual({ status: RpcStateStatusEnum.active });
		expect(readState()).toEqual({ status: RpcStateStatusEnum.unbound });
		expect(Object.isFrozen(lifecycle.state)).toBe(true);
		expect(Object.isFrozen(readState())).toBe(true);
		expect(ownerStates).toEqual(["active"]);
		expect(peerStates).toEqual(["unbound"]);

		lifecycle.commit(
			{ status: RpcStateStatusEnum.active },
			{ status: RpcStateStatusEnum.connected },
		);

		expect(lifecycle.state$).toBe(ownerStream);
		expect(lifecycle.peerStateView).toBe(view);
		expect(view.state$).toBe(peerStream);
		expect(view.readState).toBe(readState);
		expect(readState()).toEqual({ status: RpcStateStatusEnum.connected });
		expect(peerStates).toEqual(["unbound", "connected"]);
		ownerSubscription.unsubscribe();
		peerSubscription.unsubscribe();
	});

	it("commits both frozen snapshots before notifying and preserves referenced error identity", () => {
		const lifecycle = createRpcConnectorLifecycleState();
		const observed: string[] = [];
		lifecycle.state$.subscribe((state) => {
			observed.push(
				`owner:${state.status}/${lifecycle.peerStateView.readState().status}`,
			);
		});
		lifecycle.peerStateView.state$.subscribe((state) => {
			observed.push(`peer:${lifecycle.state.status}/${state.status}`);
		});
		const error = new Error("cleanup failed");
		const ownerState = {
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.cleanupFailed,
			error,
		} as const;
		const peerState = {
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.forcedClose,
		} as const;

		lifecycle.commit(ownerState, peerState);

		expect(observed).toEqual([
			"owner:active/unbound",
			"peer:active/unbound",
			"owner:closed/closed",
			"peer:closed/closed",
		]);
		expect(lifecycle.state).not.toBe(ownerState);
		expect(lifecycle.peerStateView.readState()).not.toBe(peerState);
		expect(Object.isFrozen(lifecycle.state)).toBe(true);
		expect(Object.isFrozen(lifecycle.peerStateView.readState())).toBe(true);
		expect(Reflect.get(lifecycle.state, "error")).toBe(error);
		expect(Object.isFrozen(ownerState)).toBe(false);
		expect(Object.isFrozen(peerState)).toBe(false);
		expect(Object.isFrozen(error)).toBe(false);
	});

	it("keeps reentrant commit notifications ordered while live reads and new subscribers see current state", () => {
		const lifecycle = createRpcConnectorLifecycleState();
		const ownerStates: string[] = [];
		const peerStates: string[] = [];
		const latePeerStates: string[] = [];
		const liveStates: string[] = [];
		lifecycle.state$.subscribe((state) => {
			if (state.status !== RpcStateStatusEnum.draining) return;
			lifecycle.commit(
				{ status: RpcStateStatusEnum.closing },
				{
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
				},
			);
			liveStates.push(
				lifecycle.state.status,
				lifecycle.peerStateView.readState().status,
			);
			lifecycle.peerStateView.state$.subscribe((peerState) =>
				latePeerStates.push(peerState.status),
			);
		});
		lifecycle.state$.subscribe((state) => ownerStates.push(state.status));
		lifecycle.peerStateView.state$.subscribe((state) =>
			peerStates.push(state.status),
		);

		lifecycle.commit(
			{ status: RpcStateStatusEnum.draining },
			{
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.gracefulShutdown,
			},
		);

		expect(ownerStates).toEqual(["active", "draining", "closing"]);
		expect(peerStates).toEqual(["unbound", "draining", "closed"]);
		expect(liveStates).toEqual(["closing", "closed"]);
		expect(latePeerStates).toEqual(["closed"]);
	});
});
