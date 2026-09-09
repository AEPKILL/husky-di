/**
 * @overview Verifies retained capacity.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	RpcExceptionCodeEnum,
} from "../../src/index";
import { createRpcTestNetwork } from "../protocol/test.utils";
import { IRetainedReplayService } from "./test.utils";

describe("Default Protocol aggregate retained capacity", () => {
	it("RPC-RESOURCE-002 RPC-RESOURCE-003 RPC-POLICY-002 enforces retained bytes across two Sessions", async () => {
		const mebibyte = 1024 * 1024;
		const descriptor = createRemoteServiceDescriptor(IRetainedReplayService, {
			wireName: "example.retained-replay.v1",
			methods: { run: true },
		});
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: {
				maxSessions: 2,
				maxRetainedBytesPerSession: 4 * mebibyte,
				maxRetainedBytesTotal: 4 * mebibyte + 512 * 1024,
			},
		});
		const connectors = [
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
		];
		const neverSettles = () => new Promise<void>(() => {});
		for (const connector of connectors) {
			connector.peer.expose(descriptor, { run: neverSettles });
		}

		try {
			await acceptor.listen(network.acceptorAdapter);
			for (const connector of connectors) {
				await connector.connect({ adapter: network.createConnectorAdapter() });
			}
			const remotes = acceptor.peers.map((peer) => peer.resolve(descriptor));
			const [firstRemote, secondRemote] = remotes;
			if (firstRemote === undefined || secondRemote === undefined) {
				throw new Error("Expected two retained Sessions.");
			}
			network.setInterceptor((record) =>
				record.direction === "connector" ? { drop: true } : undefined,
			);
			const payload = "x".repeat(475_000);
			const retainedCalls = [
				firstRemote.run(payload, payload),
				secondRemote.run(payload, payload),
				firstRemote.run(payload, payload),
			];
			for (const call of retainedCalls) {
				void call.catch(() => {});
			}
			await vi.waitFor(() =>
				expect(
					network.records.filter(
						(record) =>
							record.direction === "acceptor" &&
							record.value.kind === "message" &&
							(record.value.message as { kind?: unknown }).kind === "call",
					).length,
				).toBe(3),
			);

			await expect(secondRemote.run(payload, payload)).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.unavailable,
			});
		} finally {
			await Promise.allSettled([
				...connectors.map((connector) => connector.close()),
				acceptor.close(),
			]);
		}
	});

	it("RPC-RESOURCE-001 RPC-RESOURCE-002 RPC-RESOURCE-003 RPC-POLICY-002 isolates each Session aggregate from remaining Owner capacity", async () => {
		const mebibyte = 1024 * 1024;
		const descriptor = createRemoteServiceDescriptor(IRetainedReplayService, {
			wireName: "example.session-retained.v1",
			methods: { run: true },
		});
		const acceptedCalls: string[] = [];
		const network = createRpcTestNetwork();
		const blockedSend = Promise.withResolvers<void>();
		let retainedCallCount = 0;
		const acceptor = createRpcAcceptor({
			runtimePolicy: {
				maxSessions: 2,
				maxRetainedBytesPerSession: 4 * mebibyte,
				maxRetainedBytesTotal: 9 * mebibyte,
			},
		});
		acceptor.expose(descriptor, {
			run: async (left) => {
				acceptedCalls.push(left);
			},
		});
		const connectors = [
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
		];
		connectors[0]?.peer.expose(descriptor, {
			run: () => new Promise<void>(() => {}),
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			for (const connector of connectors) {
				await connector.connect({ adapter: network.createConnectorAdapter() });
			}
			const [firstConnector, secondConnector] = connectors;
			const firstRemote = acceptor.peers[0]?.resolve(descriptor);
			if (
				firstConnector === undefined ||
				secondConnector === undefined ||
				firstRemote === undefined
			) {
				throw new Error("Expected two retained Sessions.");
			}

			network.setInterceptor((record) => {
				if (record.connectionId !== 1) {
					return undefined;
				}
				if (record.direction === "connector" && record.value.kind === "ack") {
					return { drop: true };
				}
				const message = record.value.message as { readonly kind?: unknown };
				if (
					record.direction === "connector" &&
					record.value.kind === "message" &&
					message.kind === "call"
				) {
					return {
						message: new TextEncoder().encode(
							JSON.stringify({ ...record.value, ackThrough: 0 }),
						),
					};
				}
				if (
					record.direction === "acceptor" &&
					record.value.kind === "message" &&
					message.kind === "call"
				) {
					retainedCallCount += 1;
					if (retainedCallCount === 2) {
						return { settlement: blockedSend.promise };
					}
				}
				return undefined;
			});

			const payload = "x".repeat(475_000);
			const retainedCalls = [
				firstRemote.run(payload, payload),
				firstRemote.run(payload, payload),
			];
			for (const call of retainedCalls) {
				void call.catch(() => {});
			}
			await vi.waitFor(() => expect(retainedCallCount).toBe(2));
			const pendingCall = firstRemote.run(payload, payload);
			void pendingCall.catch(() => {});

			const rejectedCall = firstConnector.peer
				.resolve(descriptor)
				.run(payload, payload);
			const probeCall = firstConnector.peer
				.resolve(descriptor)
				.run("probe", "");
			void rejectedCall.catch(() => {});
			void probeCall.catch(() => {});
			await vi.waitFor(() => expect(acceptedCalls).toContain("probe"));
			expect(acceptedCalls).toEqual(["probe"]);

			await expect(
				secondConnector.peer.resolve(descriptor).run("other-session", ""),
			).resolves.toBeUndefined();
			expect(acceptedCalls).toEqual(["probe", "other-session"]);

			blockedSend.resolve();
			await expect(rejectedCall).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.unavailable,
			});
			await expect(probeCall).resolves.toBeUndefined();
		} finally {
			blockedSend.resolve();
			await Promise.allSettled([
				...connectors.map((connector) => connector.close()),
				acceptor.close(),
			]);
		}
	});
});
