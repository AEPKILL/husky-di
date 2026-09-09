/**
 * @overview Verifies acceptor cleanup.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	createRpcAcceptor,
	type RpcEvent,
	type RpcProtocolAcceptorFactory,
} from "../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolSession,
} from "../../src/protocol";

describe("Acceptor Topology Owner termination", () => {
	it("RPC-LIFE-001 RPC-LIFE-002 upgrades Acceptor drain through the same task and force path", async () => {
		let acceptorHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown: (() => void) | undefined;
		let shutdownCalls = 0;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			acceptorHost = host;
			return {
				async accept() {},
				shutdown() {
					shutdownCalls += 1;
					return new Promise<void>((resolve) => {
						resolveShutdown = resolve;
					});
				},
				close() {
					closeCalls += 1;
				},
				async cleanup() {
					cleanupCalls += 1;
				},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		if (acceptorHost?.admitSession(session) === undefined) {
			throw new Error("Expected the test Session to be admitted.");
		}
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted peer.");
		}
		const events: RpcEvent[] = [];
		const peerCloseSnapshots: Array<{
			readonly state: typeof acceptor.state;
			readonly peers: typeof acceptor.peers;
		}> = [];
		acceptor.event$.subscribe((event) => {
			if (event.type === "peer-closed") {
				peerCloseSnapshots.push({
					state: acceptor.state,
					peers: acceptor.peers,
				});
			}
			events.push(event);
		});

		const task = acceptor.shutdown();
		expect(acceptor.close()).toBe(task);
		expect(acceptor.state).toEqual({ status: "closing" });
		expect(peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		await task;

		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(peerCloseSnapshots).toEqual([
			{ state: { status: "closing" }, peers: [] },
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 1,
			cleanupCalls: 1,
		});

		resolveShutdown?.();
		await Promise.resolve();
		expect({ closeCalls, cleanupCalls }).toEqual({
			closeCalls: 1,
			cleanupCalls: 1,
		});
	});

	it("RPC-LIFE-002 does not force Acceptor after graceful cleanup has started", async () => {
		let resolveCleanup: (() => void) | undefined;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocolFactory: RpcProtocolAcceptorFactory = () => {
			return {
				async accept() {},
				async shutdown() {},
				close() {
					closeCalls += 1;
				},
				cleanup() {
					cleanupCalls += 1;
					return new Promise<void>((resolve) => {
						resolveCleanup = resolve;
					});
				},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const task = acceptor.shutdown();
		await Promise.resolve();
		await Promise.resolve();
		expect(acceptor.state).toEqual({ status: "closing" });

		expect(acceptor.close()).toBe(task);
		expect({ closeCalls, cleanupCalls }).toEqual({
			closeCalls: 0,
			cleanupCalls: 1,
		});

		resolveCleanup?.();
		await task;
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 escalates an expired grace interval without rejecting termination", async () => {
		vi.useFakeTimers();
		try {
			let shutdownCalls = 0;
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocolFactory: RpcProtocolAcceptorFactory = () => {
				return {
					async accept() {},
					shutdown() {
						shutdownCalls += 1;
						return new Promise<void>(() => {});
					},
					close() {
						closeCalls += 1;
					},
					async cleanup() {
						cleanupCalls += 1;
					},
				};
			};
			const acceptor = createRpcAcceptor({
				protocolFactory,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			let outcome: "pending" | "fulfilled" | "rejected" = "pending";
			const task = acceptor.shutdown();
			void task.then(
				() => {
					outcome = "fulfilled";
				},
				() => {
					outcome = "rejected";
				},
			);

			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "draining" });
			expect({ closeCalls, cleanupCalls, outcome }).toEqual({
				closeCalls: 0,
				cleanupCalls: 0,
				outcome: "pending",
			});

			await vi.advanceTimersByTimeAsync(1);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "shutdown-deadline",
			});
			expect({ shutdownCalls, closeCalls, cleanupCalls, outcome }).toEqual({
				shutdownCalls: 1,
				closeCalls: 1,
				cleanupCalls: 1,
				outcome: "fulfilled",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-001 gives shutdown separate non-sliding grace and cleanup intervals", async () => {
		vi.useFakeTimers();
		try {
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocolFactory: RpcProtocolAcceptorFactory = () => {
				return {
					async accept() {},
					shutdown() {
						return new Promise<void>(() => {});
					},
					close() {
						closeCalls += 1;
					},
					cleanup() {
						cleanupCalls += 1;
						return new Promise<void>(() => {});
					},
				};
			};
			const acceptor = createRpcAcceptor({
				protocolFactory,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			const outcome = acceptor.shutdown().then(
				() => undefined,
				(error: unknown) => error,
			);

			await vi.advanceTimersByTimeAsync(10);
			expect(acceptor.state).toEqual({ status: "closing" });
			expect({ closeCalls, cleanupCalls }).toEqual({
				closeCalls: 1,
				cleanupCalls: 1,
			});
			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "closing" });
			await vi.advanceTimersByTimeAsync(1);

			const error = await outcome;
			expect(error).toBeInstanceOf(Error);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 rejects a direct close at its independent cleanup deadline", async () => {
		vi.useFakeTimers();
		try {
			let resolveCleanup: (() => void) | undefined;
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocolFactory: RpcProtocolAcceptorFactory = () => {
				return {
					async accept() {},
					async shutdown() {},
					close() {
						closeCalls += 1;
					},
					cleanup() {
						cleanupCalls += 1;
						return new Promise<void>((resolve) => {
							resolveCleanup = resolve;
						});
					},
				};
			};
			const acceptor = createRpcAcceptor({
				protocolFactory,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			const task = acceptor.close();
			const outcome = task.then(
				() => undefined,
				(error: unknown) => error,
			);

			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "closing" });
			await vi.advanceTimersByTimeAsync(1);
			const error = await outcome;

			expect(error).toBeInstanceOf(Error);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			});
			expect({ closeCalls, cleanupCalls }).toEqual({
				closeCalls: 1,
				cleanupCalls: 1,
			});
			expect(acceptor.close()).toBe(task);

			resolveCleanup?.();
			await Promise.resolve();
			expect(acceptor.state).toMatchObject({
				status: "closed",
				reason: "cleanup-failed",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-003 RPC-CLEANUP-004 preserves a trusted cleanup rejection and settles after stream completion", async () => {
		const cleanupError = new Error("acceptor cleanup failed");
		const protocolFactory: RpcProtocolAcceptorFactory = () => {
			return {
				async accept() {},
				async shutdown() {},
				close() {},
				async cleanup() {
					throw cleanupError;
				},
			};
		};
		const acceptor = createRpcAcceptor({ protocolFactory });
		const order: string[] = [];
		acceptor.state$.subscribe({
			next: (state) => {
				if (state.status === "closed") {
					order.push("state-closed");
				}
			},
			complete: () => order.push("state-complete"),
		});
		acceptor.peers$.subscribe({
			complete: () => order.push("peers-complete"),
		});
		acceptor.event$.subscribe({
			next: (event) => {
				if (event.type === "topology-closed") {
					order.push("topology-closed");
				}
			},
			complete: () => order.push("event-complete"),
		});

		const task = acceptor.close();
		const outcome = task.then(
			() => undefined,
			(error: unknown) => {
				order.push("task-rejected");
				return error;
			},
		);
		const error = await outcome;

		expect(error).toBe(cleanupError);
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: cleanupError,
		});
		expect(order).toEqual([
			"state-closed",
			"state-complete",
			"peers-complete",
			"topology-closed",
			"event-complete",
			"task-rejected",
		]);
		expect(acceptor.shutdown()).toBe(task);
	});
});
