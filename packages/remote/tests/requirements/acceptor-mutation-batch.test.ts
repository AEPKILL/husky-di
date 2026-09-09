/**
 * @overview Verifies acceptor mutation batch.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	RpcCloseReasonEnum,
	type RpcEvent,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	RpcCallOutcome,
} from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";
import {
	admitEmptySession,
	batchDescriptor,
	createAcceptorHarness,
} from "./mutation/test.utils";

describe("Acceptor mutation batches", () => {
	it("RPC-API-005 commits peer terminal state and membership before terminal observers", async () => {
		const { acceptor, host } = createAcceptorHarness();
		const sessionHost = admitEmptySession(host);
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Acceptor peer.");
		}
		const observations: {
			readonly source: "peer-state" | "peers" | "event";
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly memberCount: number;
			readonly peerRetained: boolean;
		}[] = [];
		const observe = (source: "peer-state" | "peers" | "event"): void => {
			observations.push({
				source,
				ownerStatus: acceptor.state.status,
				peerStatus: peer.state.status,
				memberCount: acceptor.peers.length,
				peerRetained: acceptor.peers.includes(peer),
			});
		};
		peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("peer-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (!peers.includes(peer)) {
				observe("peers");
			}
		});
		acceptor.event$.subscribe((event: RpcEvent) => {
			if (event.type === "peer-closed") {
				observe("event");
			}
		});

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		expect(observations).toEqual([
			{
				source: "peers",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
			{
				source: "peer-state",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
			{
				source: "event",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
		]);
		await acceptor.close();
	});

	it("RPC-API-005 commits the full G snapshot before call, state, membership, and lifecycle observers", async () => {
		let resolveShutdown!: () => void;
		const { acceptor, host } = createAcceptorHarness({
			shutdown: () =>
				new Promise<void>((resolve) => {
					resolveShutdown = resolve;
				}),
		});
		admitEmptySession(host);
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		const recoveringSession: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return { start() {}, cancel() {} };
			},
			forceClose() {
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const recoveringHost = host.admitSession(recoveringSession);
		const [drainingPeer, recoveringPeer] = acceptor.peers;
		if (
			recoveringHost === undefined ||
			drainingPeer === undefined ||
			recoveringPeer === undefined
		) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		recoveringHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		const observations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly memberCount: number;
			readonly drainingStatus: string;
			readonly recoveringStatus: string;
			readonly recoveringRetained: boolean;
			readonly callSettled: boolean;
		}[] = [];
		let callSettled = false;
		const observe = (source: string): void => {
			observations.push({
				source,
				ownerStatus: acceptor.state.status,
				memberCount: acceptor.peers.length,
				drainingStatus: drainingPeer.state.status,
				recoveringStatus: recoveringPeer.state.status,
				recoveringRetained: acceptor.peers.includes(recoveringPeer),
				callSettled,
			});
		};
		acceptor.state$.subscribe((state) => {
			if (state.status === "draining") {
				observe("owner-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 1) {
				observe("peers");
			}
		});
		drainingPeer.state$.subscribe((state) => {
			if (state.status === "draining") {
				observe("draining-peer-state");
			}
		});
		recoveringPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("recovering-peer-state");
			}
		});
		const eventOrder: string[] = [];
		acceptor.event$.subscribe((event) => {
			if (
				event.type === "call-finished" ||
				event.type === "owner-draining" ||
				event.type === "peer-draining" ||
				event.type === "peer-closed"
			) {
				eventOrder.push(event.type);
				observe(event.type);
			}
		});
		const callOutcome = recoveringPeer
			.resolve(batchDescriptor)
			.wait()
			.then(
				() => undefined,
				(error: unknown) => {
					callSettled = true;
					return error;
				},
			);

		const shutdownTask = acceptor.shutdown();

		const expectedSnapshot = {
			ownerStatus: "draining",
			memberCount: 1,
			drainingStatus: "draining",
			recoveringStatus: "closed",
			recoveringRetained: false,
			callSettled: false,
		};
		expect(observations).toEqual([
			{ source: "call-finished", ...expectedSnapshot },
			{ source: "owner-state", ...expectedSnapshot },
			{ source: "peers", ...expectedSnapshot },
			{ source: "draining-peer-state", ...expectedSnapshot },
			{ source: "recovering-peer-state", ...expectedSnapshot },
			{ source: "owner-draining", ...expectedSnapshot },
			{ source: "peer-draining", ...expectedSnapshot },
			{ source: "peer-closed", ...expectedSnapshot },
		]);
		expect(eventOrder).toEqual([
			"call-finished",
			"owner-draining",
			"peer-draining",
			"peer-closed",
		]);
		await expect(callOutcome).resolves.toMatchObject({
			code: "outcome-unknown",
		});

		resolveShutdown();
		await shutdownTask;
	});

	it("RPC-API-005 fences Acceptor graceful effects when close reenters state notification", async () => {
		let shutdownCalls = 0;
		let closeCalls = 0;
		const { acceptor } = createAcceptorHarness({
			shutdown: async () => {
				shutdownCalls += 1;
			},
			close: () => {
				closeCalls += 1;
			},
		});
		const order: string[] = [];
		let taskSettled = false;
		const reentrantCloseTasks: Promise<void>[] = [];

		acceptor.state$.subscribe({
			next: (state) => {
				if (state.status === "active") {
					return;
				}
				expect(acceptor.state).toBe(state);
				expect(taskSettled).toBe(false);
				order.push(`owner-state:${state.status}`);
				if (state.status === "draining") {
					reentrantCloseTasks.push(acceptor.close());
				}
			},
			complete: () => order.push("owner-complete"),
		});
		acceptor.state$.subscribe((state) => {
			if (state.status === "draining") {
				reentrantCloseTasks.push(acceptor.close());
			}
		});
		acceptor.peers$.subscribe({
			complete: () => order.push("peers-complete"),
		});
		acceptor.event$.subscribe({
			next: (event) => {
				expect(taskSettled).toBe(false);
				order.push(event.type);
			},
			complete: () => order.push("event-complete"),
		});

		const terminationTask = acceptor.shutdown();
		void terminationTask.then(() => {
			taskSettled = true;
		});
		expect(reentrantCloseTasks).toEqual([terminationTask, terminationTask]);
		await terminationTask;

		expect(order).toEqual([
			"owner-state:draining",
			"owner-draining",
			"owner-state:closing",
			"owner-closing",
			"owner-state:closed",
			"owner-complete",
			"peers-complete",
			"topology-closed",
			"event-complete",
		]);
		expect(shutdownCalls).toBe(0);
		expect(closeCalls).toBe(1);
		expect(taskSettled).toBe(true);
	});

	it("RPC-API-005 runs Acceptor graceful continuation when shutdown reenters listener notification", async () => {
		let shutdownCalls = 0;
		const { acceptor } = createAcceptorHarness({
			shutdown: async () => {
				shutdownCalls += 1;
			},
		});
		const connectionSource = new Subject<IRpcConnection>();
		let adapterListenCalls = 0;
		let shutdownTask: Promise<void> | undefined;
		acceptor.state$.subscribe((state) => {
			if (state.status === "active" && state.listener.status === "starting") {
				shutdownTask = acceptor.shutdown();
			}
		});

		const listenTask = acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {
				adapterListenCalls += 1;
			},
		});
		await expect(listenTask).rejects.toMatchObject({ name: "AbortError" });
		if (shutdownTask === undefined) {
			throw new Error(
				"Expected shutdown to reenter the listener notification.",
			);
		}
		await shutdownTask;

		expect(adapterListenCalls).toBe(0);
		expect(shutdownCalls).toBe(1);
		expect(acceptor.state).toMatchObject({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
	});
});
