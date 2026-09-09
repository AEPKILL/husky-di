/**
 * @overview Verifies protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../src/index";
import {
	createRpcCounterExhaustionProtocolAcceptorForTest,
	createRpcCounterExhaustionProtocolConnectorForTest,
} from "../src/modules/protocol";
import {
	collectPublicErrorText,
	createMemoryAdapters,
	createRecoveryNetwork,
	ICalculatorService,
} from "./protocol/network/test.utils";

afterEach(() => vi.useRealTimers());

describe("Default RPC Protocol", () => {
	it("ORDER-003 exposes a package-private real-ledger counter exhaustion seam RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor({
			protocolFactory: createRpcCounterExhaustionProtocolAcceptorForTest,
		});
		const connector = createRpcConnector({
			protocolFactory: createRpcCounterExhaustionProtocolConnectorForTest,
		});
		acceptor.expose(descriptor, { add: (left, right) => left + right });

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		const call = connector.peer.resolve(descriptor).add(1, 2);
		void call.catch(() => {});
		await vi.waitFor(() => {
			expect(connector.peer.state).toEqual({
				status: "draining",
				reason: "counter-exhaustion",
			});
		});
		await Promise.all([connector.close(), acceptor.close()]);
		await expect(call).rejects.toMatchObject({ code: "unavailable" });
	});

	it("RPC-PKG-003 RPC-WIRE-001 RPC-ACK-001 RPC-ACK-003 performs one fresh unary call with directional ledgers RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
		acceptor.expose(descriptor, {
			add: (left, right) => left + right,
		});

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		await expect(connector.peer.resolve(descriptor).add(19, 23)).resolves.toBe(
			42,
		);

		await vi.waitFor(() => {
			expect(
				adapters.records.some(
					(record) =>
						record.direction === "connector" &&
						record.value.kind === "ack" &&
						record.value.ackThrough === 1,
				),
			).toBe(true);
		});
		const call = adapters.records.find(
			(record) =>
				record.direction === "connector" && record.value.kind === "message",
		)?.value;
		const result = adapters.records.find(
			(record) =>
				record.direction === "acceptor" && record.value.kind === "message",
		)?.value;

		expect(adapters.records[0]?.value).toMatchObject({
			kind: "fresh",
			profiles: ["husky-di-rpc/1"],
		});
		expect(
			adapters.records.find(
				(record) =>
					record.direction === "acceptor" && record.value.kind === "accept",
			)?.value,
		).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
		});
		expect(call).toMatchObject({
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "example.calculator.v1",
				method: "add",
				args: [19, 23],
			},
		});
		expect(result).toMatchObject({
			kind: "message",
			seq: 1,
			ackThrough: 1,
			message: { kind: "result", callId: "1", value: 42 },
		});
		expect(adapters.maximumConcurrentSends).toEqual({
			connector: 1,
			acceptor: 1,
		});
	});

	it("RPC-SEC-002 issues an independent 256-bit bearer resume token in FreshAccept", async () => {
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		const freshRequest = adapters.records[0]?.value;
		const freshAccept = adapters.records.find(
			(record) =>
				record.direction === "acceptor" && record.value.kind === "accept",
		)?.value;

		expect(freshRequest).toEqual({
			kind: "fresh",
			profiles: ["husky-di-rpc/1"],
		});
		expect(freshAccept).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
			sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			resumeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
		});
		expect(freshAccept?.resumeToken).not.toBe(freshAccept?.sessionId);
		expect(
			adapters.records.filter((record) => "resumeToken" in record.value),
		).toHaveLength(1);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SEC-008 redacts a token-bearing FreshAccept Adapter failure at the public Connector boundary", async () => {
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const decoder = new TextDecoder();
		let resumeToken: unknown;
		await acceptor.listen(network.acceptorAdapter);

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => {
					const isFreshAccept =
						record.direction === "acceptor" &&
						record.value.kind === "accept" &&
						!("receivedThrough" in record.value);
					if (!isFreshAccept) {
						return {};
					}
					resumeToken = record.value.resumeToken;
					return { peerError: new Error(decoder.decode(message)) };
				}),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);

		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		expect(failure).toMatchObject({ code: "unavailable" });
		expect(collectPublicErrorText(failure)).not.toContain(resumeToken);
		expect(connector.peer.state.status).toBe("unbound");
		await Promise.all([connector.close(), acceptor.close()]);
	});
});
