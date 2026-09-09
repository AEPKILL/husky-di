/**
 * @overview Verifies recovery binding.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { createRpcSecurityCarrier } from "../../src/modules/protocol";
import {
	createRecoveryNetwork,
	ICalculatorService,
} from "./network/test.utils";

afterEach(() => vi.useRealTimers());

describe("Default RPC Protocol", () => {
	it("RPC-RECOVERY-003 makes installed resume acceptance win the old recovery deadline", async () => {
		const network = createRecoveryNetwork();
		let releaseAccept!: () => void;
		const acceptSettlement = new Promise<void>((resolve) => {
			releaseAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 150,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? acceptSettlement
						: undefined,
			})),
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 70));

		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("recovering");
		releaseAccept();
		await vi.waitFor(() => {
			expect(acceptorPeer?.state.status).toBe("connected");
		});
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-RECOVERY-002 restarts retention when an installed binding attempt times out", async () => {
		vi.useFakeTimers();
		const network = createRecoveryNetwork();
		let releaseTimedOutAccept!: () => void;
		const timedOutAccept = new Promise<void>((resolve) => {
			releaseTimedOutAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 300,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? timedOutAccept
						: undefined,
			})),
		});
		await vi.advanceTimersByTimeAsync(50);
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		releaseTimedOutAccept();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-007 RPC-SESSION-009 RPC-CORPUS-003 lets a higher resume fence an installed accept still in flight", async () => {
		const network = createRecoveryNetwork();
		let releaseFirstAccept!: () => void;
		const firstAccept = new Promise<void>((resolve) => {
			releaseFirstAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? firstAccept
						: undefined,
			})),
		});
		const higherRequest = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough: 0,
			resumeAttempt: 2,
		};
		const raw = network.openRawConnection();

		raw.send(higherRequest);
		await vi.waitFor(() => {
			expect(raw.responses[0]).toMatchObject({
				kind: "accept",
				bindingEpoch: 3,
			});
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("connected");
		});
		releaseFirstAccept();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("connected");
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-007 RPC-RECOVERY-005 RPC-SEC-007 RPC-CORPUS-003 fences an old binding while its initiator and send completion are late", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		let releaseLateSend!: () => void;
		const lateSend = new Promise<void>((resolve) => {
			releaseLateSend = resolve;
		});
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter(
				(record) => ({
					settlement:
						record.direction === "connector" &&
						record.value.kind === "message" &&
						(record.value.message as { readonly kind?: string }).kind === "call"
							? lateSend
							: undefined,
				}),
				"silent",
			),
		});
		const acceptorPeer = acceptor.peers[0];
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		const rawRequest = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough: 0,
			resumeAttempt: 1,
		};
		const raw = network.openRawConnection();

		raw.send(rawRequest);
		await vi.waitFor(() => {
			expect(raw.responses[0]).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			});
		});
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");

		const call = connector.peer.resolve(descriptor).add(21, 21);
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
		expect(handlerCalls).toBe(0);
		network.disconnectSide(1, "connector");
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await expect(
			connector.connect({ adapter: network.createConnectorAdapter() }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(acceptorPeer?.state.status).toBe("connected");
		await connector.connect({ adapter: network.createConnectorAdapter() });

		await expect(call).resolves.toBe(42);
		expect(handlerCalls).toBe(1);
		expect(acceptor.peers[0]).toBe(acceptorPeer);
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
		for (const record of network.records.filter(
			(record) =>
				record.value.kind === "message" ||
				record.value.kind === "ack" ||
				record.value.kind === "ping" ||
				record.value.kind === "pong" ||
				record.value.kind === "close",
		)) {
			expect(record.value).not.toHaveProperty("authTag");
		}
		releaseLateSend();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
	});

	it.each([
		"profile",
		"session",
		"token",
	] as const)("RPC-SEC-005 RPC-SEC-008 RPC-RECOVERY-006 keeps a %s mismatch generic, redacted, and non-authoritative RPC-CORPUS-002", async (mismatch) => {
		const network = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 500,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
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
			expect(acceptorPeer?.state.status).toBe("recovering");
		});
		const replacementSessionId = createRpcSecurityCarrier();
		const replacementResumeToken = createRpcSecurityCarrier();
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => {
					if (
						record.direction !== "connector" ||
						record.value.kind !== "resume"
					) {
						return {};
					}
					const value = JSON.parse(decoder.decode(message)) as Record<
						string,
						unknown
					>;
					if (mismatch === "profile") {
						value.profile = "husky-di-rpc/2";
					} else if (mismatch === "session") {
						value.sessionId = replacementSessionId;
					} else {
						value.resumeToken = replacementResumeToken;
					}
					return { message: encoder.encode(JSON.stringify(value)) };
				}),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);
		expect(failure).toMatchObject({ code: "unavailable" });
		expect(String(failure)).not.toContain(resumeToken);
		expect(String(failure)).not.toContain(replacementResumeToken);
		expect(JSON.stringify(connector.peer.state)).not.toContain(resumeToken);
		expect(JSON.stringify(acceptorPeer?.state)).not.toContain(resumeToken);

		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "reject",
			)?.value,
		).toEqual({ kind: "reject", code: "resume-rejected" });
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
	});
});
