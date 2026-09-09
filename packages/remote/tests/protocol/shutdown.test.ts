/**
 * @overview Verifies shutdown.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import {
	createRecoveryNetwork,
	ICalculatorService,
	IDeferredCalculatorService,
} from "./network/test.utils";

afterEach(() => vi.useRealTimers());

describe("Default RPC Protocol", () => {
	it("RPC-SHUTDOWN-003 RPC-SHUTDOWN-005 drains queued post-G ingress through resource rejection before Close", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.shutdown-ingress.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		let rejectPhase = false;
		let handlerCalls = 0;
		const callEvents: string[] = [];
		connector.peer.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		connector.event$.subscribe((event) => {
			if (event.type === "call-started" || event.type === "call-finished") {
				callEvents.push(event.type);
			}
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				drop: rejectPhase && record.direction === "connector",
			})),
		});
		rejectPhase = true;
		network.emit(1, "connector", {
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "example.shutdown-ingress.v1",
				method: "add",
				args: [20, 22],
			},
		});

		const shutdown = connector.shutdown();
		expect(connector.state).toEqual({ status: "draining" });
		await vi.waitFor(() => {
			expect(
				network.records.some((record) => {
					const message = record.value.message as
						| Readonly<Record<string, unknown>>
						| undefined;
					const error = message?.error as
						| Readonly<Record<string, unknown>>
						| undefined;
					return (
						record.direction === "connector" &&
						message?.kind === "error" &&
						error?.code === "unavailable"
					);
				}),
			).toBe(true);
		});
		network.emit(1, "connector", { kind: "ack", ackThrough: 1 });
		await shutdown;

		expect(handlerCalls).toBe(0);
		expect(callEvents).toEqual([]);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		expect(network.directCloseCount(1)).toBe(1);
		await acceptor.close();
	});

	it("RPC-SHUTDOWN-005 waits for bidirectional calls, queued work, replay, ACK, and send idle", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.shutdown-predicate.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		let releaseFirstSend!: () => void;
		const firstSend = new Promise<void>((resolve) => {
			releaseFirstSend = resolve;
		});
		let blockFirstCall = true;
		const acceptorResolvers = new Map<number, (value: number) => void>();
		let resolveConnectorHandler!: (value: number) => void;
		let connectorHandlerCalls = 0;
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		acceptor.expose(descriptor, {
			add(left) {
				return new Promise<number>((resolve) => {
					acceptorResolvers.set(left, resolve);
				});
			},
		});
		connector.peer.expose(descriptor, {
			add() {
				connectorHandlerCalls += 1;
				return new Promise<number>((resolve) => {
					resolveConnectorHandler = resolve;
				});
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => {
				const message = record.value.message as
					| Readonly<Record<string, unknown>>
					| undefined;
				if (
					blockFirstCall &&
					record.direction === "connector" &&
					message?.kind === "call"
				) {
					blockFirstCall = false;
					return { settlement: firstSend };
				}
				return {};
			}, "silent"),
		});
		const acceptorPeer = acceptor.peers[0];
		if (acceptorPeer === undefined) {
			throw new Error("Expected a connected peer.");
		}
		const connectorService = connector.peer.resolve(descriptor);
		const first = connectorService.add(1, 1);
		void first.catch(() => {});
		await vi.waitFor(() => expect(acceptorResolvers.has(1)).toBe(true));
		const queued = connectorService.add(2, 2);
		void queued.catch(() => {});
		const incoming = acceptorPeer.resolve(descriptor).add(3, 3);
		void incoming.catch(() => {});
		await vi.waitFor(() => expect(connectorHandlerCalls).toBe(1));

		let shutdownSettled = false;
		const shutdown = connector.shutdown().then(() => {
			shutdownSettled = true;
		});
		expect(connector.state).toEqual({ status: "draining" });
		expect(shutdownSettled).toBe(false);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toEqual([]);

		acceptorResolvers.get(1)?.(2);
		resolveConnectorHandler(6);
		await expect(first).resolves.toBe(2);
		await Promise.resolve();
		expect(shutdownSettled).toBe(false);
		expect(acceptorResolvers.has(2)).toBe(false);

		releaseFirstSend();
		await vi.waitFor(() => expect(acceptorResolvers.has(2)).toBe(true));
		acceptorResolvers.get(2)?.(4);
		await expect(queued).resolves.toBe(4);
		await expect(incoming).resolves.toBe(6);
		await shutdown;

		expect(shutdownSettled).toBe(true);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		await acceptor.close();
	});

	it("RPC-SHUTDOWN-004 RPC-SHUTDOWN-008 forces only the draining peer whose binding is lost", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.shutdown-binding-loss.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connectors = [createRpcConnector(), createRpcConnector()] as const;
		let handlerCalls = 0;
		for (const connector of connectors) {
			connector.peer.expose(descriptor, {
				add() {
					handlerCalls += 1;
					return new Promise<number>(() => {});
				},
			});
		}
		const events: string[] = [];
		acceptor.event$.subscribe((event) => events.push(event.type));

		await acceptor.listen(network.acceptorAdapter);
		for (const connector of connectors) {
			await connector.connect({ adapter: network.createConnectorAdapter() });
		}
		const firstPeer = acceptor.peers[0];
		const secondPeer = acceptor.peers[1];
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two connected peers.");
		}
		const firstCall = firstPeer.resolve(descriptor).add(1, 2);
		const secondCall = secondPeer.resolve(descriptor).add(3, 4);
		void firstCall.catch(() => {});
		void secondCall.catch(() => {});
		await vi.waitFor(() => expect(handlerCalls).toBe(2));

		const shutdown = acceptor.shutdown();
		expect(firstPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(secondPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		network.disconnect(1);

		await expect(firstCall).rejects.toMatchObject({ code: "outcome-unknown" });
		expect(firstPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(acceptor.peers).toEqual([secondPeer]);
		expect(secondPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(events).not.toContain("peer-recovering");

		expect(acceptor.close()).toBe(shutdown);
		await shutdown;
		await expect(secondCall).rejects.toMatchObject({ code: "outcome-unknown" });
		await Promise.all(connectors.map((connector) => connector.close()));
	});

	it.each([
		"fulfilled",
		"rejected",
		"terminal",
	] as const)("RPC-SHUTDOWN-006 RPC-SHUTDOWN-007 sends one egress Close shell when the send is %s", async (outcome) => {
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => {
				if (record.direction !== "connector" || record.value.kind !== "close") {
					return {};
				}
				if (outcome === "rejected") {
					return {
						drop: true,
						error: new Error("Close send rejected."),
					};
				}
				if (outcome === "terminal") {
					network.disconnectSide(record.connectionId, "connector");
					return { drop: true };
				}
				return {};
			}, "silent"),
		});

		await connector.shutdown();

		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		expect(network.directCloseCount(1)).toBe(1);
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: outcome === "terminal" ? "forced-close" : "graceful-shutdown",
		});
		await acceptor.close();
	});
});
