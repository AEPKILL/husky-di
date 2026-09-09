/**
 * @overview Verifies state projection.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	RpcCloseOutcomeEnum,
	RpcCloseReasonEnum,
	RpcEventTypeEnum,
	RpcStateStatusEnum,
} from "../../src/index";
import type { IRpcProtocolSession } from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import { connectProtocolSession, createProtocolHarness } from "./test.utils";

describe("Protocol Session state projection", () => {
	it("RPC-API-005 commits related Connector snapshots before terminal notifications and settles last", async () => {
		const harness = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.connectorFactory,
		});
		let taskSettled = false;
		const observations: Array<{
			readonly source: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly taskSettled: boolean;
		}> = [];
		connector.state$.subscribe((state) => {
			if (state.status === "closing") {
				observations.push({
					source: "owner-state",
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});
		connector.peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observations.push({
					source: "peer-state",
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});
		connector.event$.subscribe((event) => {
			if (
				event.type === "peer-closed" ||
				event.type === "owner-closing" ||
				event.type === "topology-closed"
			) {
				observations.push({
					source: event.type,
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});

		const task = connector.close().then(() => {
			taskSettled = true;
		});
		await task;

		expect(observations.map(({ source }) => source)).toEqual([
			"owner-state",
			"peer-state",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(observations.slice(0, -1)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ownerStatus: "closing",
					peerStatus: "closed",
					taskSettled: false,
				}),
			]),
		);
		expect(observations.every(({ taskSettled: settled }) => !settled)).toBe(
			true,
		);
	});

	it("RPC-API-005 commits related Connector graceful snapshots before draining notifications and settles last", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		let taskSettled = false;
		const observations: Array<{
			readonly source: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly taskSettled: boolean;
		}> = [];
		const observe = (source: string): void => {
			observations.push({
				source,
				ownerStatus: connector.state.status,
				peerStatus: connector.peer.state.status,
				taskSettled,
			});
		};
		connector.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining) {
				observe("owner-state");
			}
		});
		connector.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining) {
				observe("peer-state");
			}
		});
		connector.event$.subscribe((event) => {
			if (
				event.type === RpcEventTypeEnum.ownerDraining ||
				event.type === RpcEventTypeEnum.peerDraining
			) {
				observe(event.type);
			}
		});

		const task = connector.shutdown().then(() => {
			taskSettled = true;
		});

		const committedSnapshot = {
			ownerStatus: RpcStateStatusEnum.draining,
			peerStatus: RpcStateStatusEnum.draining,
			taskSettled: false,
		};
		expect(observations).toEqual([
			{ source: "owner-state", ...committedSnapshot },
			{ source: "peer-state", ...committedSnapshot },
			{ source: "owner-draining", ...committedSnapshot },
			{ source: "peer-draining", ...committedSnapshot },
		]);

		await task;
	});

	it("RPC-API-003 RPC-API-005 RPC-CLEANUP-004 serializes reentrant forced close after the graceful notification wave", async () => {
		const harness = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.connectorFactory,
		});
		const order: string[] = [];
		let taskSettled = false;
		const reentrantCloseTasks: Promise<void>[] = [];

		connector.state$.subscribe({
			next: (state) => {
				if (state.status === RpcStateStatusEnum.active) {
					return;
				}
				expect(connector.state).toBe(state);
				expect(taskSettled).toBe(false);
				order.push(`owner-state:${state.status}`);
				if (state.status === RpcStateStatusEnum.draining) {
					reentrantCloseTasks.push(connector.close());
				}
			},
			complete: () => {
				expect(taskSettled).toBe(false);
				order.push("owner-complete");
			},
		});
		connector.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining) {
				reentrantCloseTasks.push(connector.close());
			}
		});
		connector.peer.state$.subscribe({
			next: (state) => {
				if (state.status !== RpcStateStatusEnum.closed) {
					return;
				}
				expect(connector.peer.state).toBe(state);
				expect(taskSettled).toBe(false);
				order.push("peer-state:closed");
			},
			complete: () => {
				expect(taskSettled).toBe(false);
				order.push("peer-complete");
			},
		});
		connector.event$.subscribe({
			next: (event) => {
				expect(taskSettled).toBe(false);
				order.push(event.type);
			},
			complete: () => {
				expect(taskSettled).toBe(false);
				order.push("event-complete");
			},
		});

		const terminationTask = connector.shutdown();
		void terminationTask.then(() => {
			taskSettled = true;
		});
		expect(reentrantCloseTasks).toEqual([terminationTask, terminationTask]);
		await terminationTask;

		expect(order).toEqual([
			"owner-state:draining",
			"peer-state:closed",
			"owner-draining",
			"peer-closed",
			"peer-complete",
			"owner-state:closing",
			"owner-closing",
			"owner-state:closed",
			"owner-complete",
			"topology-closed",
			"event-complete",
		]);
		expect(harness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
		expect(taskSettled).toBe(true);
	});

	it("RPC-API-005 runs the graceful continuation when shutdown reenters a peer notification", async () => {
		let forceCloseCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCloseCalls += 1;
			},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		let shutdownTask: Promise<void> | undefined;
		connector.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.recovering) {
				shutdownTask = connector.shutdown();
			}
		});

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		if (shutdownTask === undefined) {
			throw new Error(
				"Expected shutdown to reenter the recovering notification.",
			);
		}
		await shutdownTask;

		expect(forceCloseCalls).toBe(1);
		expect(connector.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		expect(connector.peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			reason: RpcCloseReasonEnum.forcedClose,
		});
	});

	it("RPC-STATE-001 RPC-SPI-010 projects Connector recovery and terminal ordering on stable streams", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost, events } =
			await connectProtocolSession(session);
		let peerCompleted = false;
		let ownerCompleted = false;
		let eventCompleted = false;
		connector.peer.state$.subscribe({
			complete: () => {
				peerCompleted = true;
			},
		});
		connector.state$.subscribe({
			complete: () => {
				ownerCompleted = true;
			},
		});
		connector.event$.subscribe({
			complete: () => {
				eventCompleted = true;
			},
		});

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(connector.peer.state).toEqual({ status: "recovering" });
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(connector.peer.state).toEqual({ status: "connected" });
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		expect(connector.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
		expect(connector.state).toEqual({ status: "closing" });
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-recovering",
			"peer-recovered",
			"peer-closed",
			"owner-closing",
		]);
		expect(peerCompleted).toBe(true);
		expect(ownerCompleted).toBe(false);
		expect(eventCompleted).toBe(false);

		await connector.shutdown();
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-recovering",
			"peer-recovered",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(ownerCompleted).toBe(true);
		expect(eventCompleted).toBe(true);
	});
});
