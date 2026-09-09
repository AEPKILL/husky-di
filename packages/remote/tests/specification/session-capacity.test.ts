/**
 * @overview Verifies session capacity.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import { createRpcAcceptor, createRpcConnector } from "../../src/index";
import { createRpcTestNetwork } from "../protocol/test.utils";
import { sessionCapacityPolicy } from "./test.utils";

describe("Default Protocol Session capacity", () => {
	it("RPC-RESOURCE-006 reclaims Recovery episodes by disconnection time rather than Session creation order", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 2 },
		});
		const laterDisconnectedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const firstDisconnectedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await laterDisconnectedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			await firstDisconnectedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const [laterDisconnectedPeer, firstDisconnectedPeer] = acceptor.peers;
			if (
				laterDisconnectedPeer === undefined ||
				firstDisconnectedPeer === undefined
			) {
				throw new Error("Expected two retained Peers.");
			}
			network.setInterceptor((record) =>
				record.connectionId === 2 ? { drop: true } : undefined,
			);

			await vi.advanceTimersByTimeAsync(30);

			expect(laterDisconnectedPeer.state).toEqual({ status: "connected" });
			expect(firstDisconnectedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(() => ({ drop: true }));
			await vi.advanceTimersByTimeAsync(30);
			expect(laterDisconnectedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(undefined);

			await freshConnector.connect({
				adapter: network.createConnectorAdapter(),
			});

			expect(firstDisconnectedPeer.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "forced-close",
			});
			expect(laterDisconnectedPeer.state).toEqual({ status: "recovering" });
			expect(acceptor.peers).toContain(laterDisconnectedPeer);
			expect(acceptor.peers).not.toContain(firstDisconnectedPeer);
			expect(acceptor.peers).toHaveLength(2);
		} finally {
			await Promise.allSettled([
				laterDisconnectedConnector.close(),
				firstDisconnectedConnector.close(),
				freshConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
	});

	it("RPC-SESSION-003 RPC-RECOVERY-003 RPC-RESOURCE-006 reclaims a recovering Session for fresh admission at capacity", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 1 },
		});
		const retainedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const overflowConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await retainedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const retainedPeer = acceptor.peers[0];
			if (retainedPeer === undefined) {
				throw new Error("Expected one retained Peer.");
			}
			network.setInterceptor(() => ({ drop: true }));

			await vi.advanceTimersByTimeAsync(30);

			expect(retainedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(undefined);
			const freshAttempts = await Promise.allSettled([
				freshConnector.connect({ adapter: network.createConnectorAdapter() }),
				overflowConnector.connect({
					adapter: network.createConnectorAdapter(),
				}),
			]);

			expect(
				freshAttempts.filter((attempt) => attempt.status === "fulfilled"),
			).toHaveLength(1);
			expect(
				freshAttempts.find((attempt) => attempt.status === "rejected"),
			).toMatchObject({ reason: { code: "unavailable" } });
			expect(retainedPeer.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "forced-close",
			});
			expect(acceptor.peers).toHaveLength(1);
			expect(acceptor.peers).not.toContain(retainedPeer);
			expect(
				[freshConnector.peer, overflowConnector.peer].filter(
					(peer) => peer.state.status === "connected",
				),
			).toHaveLength(1);
			expect(retainedConnector.peer.state).toEqual({ status: "recovering" });

			await vi.advanceTimersByTimeAsync(999);
			expect(retainedConnector.peer.state).toEqual({ status: "recovering" });
			await vi.advanceTimersByTimeAsync(1);
			expect(retainedConnector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "recovery-expired",
				error: { code: "unavailable" },
			});
		} finally {
			await Promise.allSettled([
				retainedConnector.close(),
				freshConnector.close(),
				overflowConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
	});

	it("RPC-SESSION-003 RPC-SESSION-009 RPC-SESSION-011 RPC-RECOVERY-003 RPC-RESOURCE-006 protects a linearized pre-activation replacement binding from fresh pressure", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptSettlement = Promise.withResolvers<void>();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 1 },
		});
		const retainedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await retainedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const retainedPeer = acceptor.peers[0];
			if (retainedPeer === undefined) {
				throw new Error("Expected one retained Peer.");
			}
			network.setInterceptor(() => ({ drop: true }));
			await vi.advanceTimersByTimeAsync(30);
			expect(retainedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor((record) =>
				record.connectionId === 2 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept" &&
				!("resumeToken" in record.value)
					? { settlement: acceptSettlement.promise }
					: undefined,
			);

			await retainedConnector.connect({
				adapter: network.createConnectorAdapter(),
			});

			expect(retainedPeer.state).toEqual({ status: "recovering" });
			await expect(
				freshConnector.connect({
					adapter: network.createConnectorAdapter(),
				}),
			).rejects.toMatchObject({ code: "unavailable" });
			expect(acceptor.peers).toEqual([retainedPeer]);
			expect(retainedPeer.state).toEqual({ status: "recovering" });

			acceptSettlement.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(retainedPeer.state).toEqual({ status: "connected" });
		} finally {
			acceptSettlement.resolve();
			await Promise.allSettled([
				retainedConnector.close(),
				freshConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
	});
});
