/**
 * @overview Verifies recovery replay.
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
	it("RPC-SESSION-001 RPC-SESSION-005 RPC-SESSION-006 RPC-RECOVERY-004 RPC-ACK-007 RPC-LEDGER-002 RPC-CORPUS-003 resumes the retained Session and replays an unreceived call identity RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		const connectorPeer = connector.peer;

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				drop:
					record.direction === "connector" &&
					record.value.kind === "message" &&
					(record.value.message as { readonly kind?: string }).kind === "call",
			})),
		});
		const acceptorPeer = acceptor.peers[0];
		const call = connector.peer.resolve(descriptor).add(20, 22);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 1 &&
						record.direction === "connector" &&
						record.value.kind === "message",
				),
			).toBe(true);
		});

		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptor.peers[0]?.state.status).toBe("recovering");
		});
		await connector.connect({ adapter: network.createConnectorAdapter() });

		await expect(call).resolves.toBe(42);
		expect(connector.peer).toBe(connectorPeer);
		expect(acceptor.peers[0]).toBe(acceptorPeer);
		expect(handlerCalls).toBe(1);
		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "connector" &&
					record.value.kind === "resume",
			)?.value,
		).toMatchObject({
			kind: "resume",
			profile: "husky-di-rpc/1",
			resumeAttempt: 1,
			receivedThrough: 0,
		});
		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept",
			)?.value,
		).toMatchObject({
			kind: "accept",
			bindingEpoch: 2,
			receivedThrough: 0,
		});
		const replayedCalls = network.records.filter(
			(record) =>
				record.direction === "connector" &&
				record.value.kind === "message" &&
				(record.value.message as { readonly kind?: string }).kind === "call",
		);
		expect(replayedCalls).toHaveLength(2);
		expect(replayedCalls.map((record) => record.value.seq)).toEqual([1, 1]);
		expect(
			replayedCalls.map(
				(record) =>
					(record.value.message as { readonly callId: string }).callId,
			),
		).toEqual(["1", "1"]);
	});

	it("RPC-ACK-002 RPC-ACK-006 RPC-ACK-007 confirms durable receipt before handler completion and replay release RPC-VALID-002 RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.deferred-calculator.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		let resolveHandler!: (value: number) => void;
		const handlerResult = new Promise<number>((resolve) => {
			resolveHandler = resolve;
		});
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1_000,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add() {
				handlerCalls += 1;
				return handlerResult;
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const call = connector.peer.resolve(descriptor).add(20, 22);
		await vi.waitFor(() => {
			expect(handlerCalls).toBe(1);
		});

		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptor.peers[0]?.state.status).toBe("recovering");
		});
		await connector.connect({ adapter: network.createConnectorAdapter() });

		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept",
			)?.value,
		).toMatchObject({ receivedThrough: 1 });
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" &&
					record.value.kind === "message" &&
					(record.value.message as { readonly kind?: string }).kind === "call",
			),
		).toHaveLength(1);
		expect(handlerCalls).toBe(1);

		resolveHandler(42);
		await expect(call).resolves.toBe(42);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it.each([
		["lower", 0],
		["upper", 2],
	] as const)("RPC-SESSION-008 RPC-SEC-006 RPC-VALID-004 RPC-CORPUS-003 treats a token-authorized %s resume cursor as continuity-failure RPC-CORPUS-002", async (_position, receivedThrough) => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, { add: (left, right) => left + right });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		await expect(connector.peer.resolve(descriptor).add(1, 2)).resolves.toBe(3);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 1 &&
						record.direction === "connector" &&
						record.value.kind === "ack" &&
						record.value.ackThrough === 1,
				),
			).toBe(true);
		});
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		const request = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough,
			resumeAttempt: 1,
		};
		const raw = network.openRawConnection();

		raw.send(request);

		await vi.waitFor(() => {
			expect(raw.responses[0]).toEqual({
				kind: "reject",
				code: "continuity-failure",
			});
		});
		await vi.waitFor(() => {
			expect(acceptorPeer?.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "continuity-failure",
			});
			expect(connector.peer.state.status).toBe("recovering");
		});
	});

	it("RPC-SESSION-006 RPC-SESSION-007 RPC-RECOVERY-002 RPC-SEC-003 RPC-CORPUS-003 recovers a lost resume accept with the stable token and a higher attempt RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, { add: (left, right) => left + right });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		const resumeToken = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value.resumeToken;
		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await expect(
			connector.connect({
				adapter: network.createConnectorAdapter((record) => ({
					drop:
						record.connectionId === 2 &&
						record.direction === "acceptor" &&
						record.value.kind === "accept",
				})),
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});

		await connector.connect({ adapter: network.createConnectorAdapter() });

		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		await expect(connector.peer.resolve(descriptor).add(40, 2)).resolves.toBe(
			42,
		);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeToken),
		).toEqual([resumeToken, resumeToken]);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "acceptor" &&
						record.value.kind === "accept" &&
						"receivedThrough" in record.value,
				)
				.map((record) => record.value.bindingEpoch),
		).toEqual([2, 3]);
	});
});
