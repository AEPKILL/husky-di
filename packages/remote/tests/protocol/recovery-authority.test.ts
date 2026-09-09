/**
 * @overview Verifies recovery authority.
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
	collectPublicErrorText,
	createRecoveryNetwork,
	ICalculatorService,
} from "./network/test.utils";

afterEach(() => vi.useRealTimers());

describe("Default RPC Protocol", () => {
	it("RPC-SEC-008 redacts a token-bearing ResumeRequest Adapter failure at the public Connector boundary", async () => {
		const network = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 500,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
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
		const decoder = new TextDecoder();

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => ({
					drop:
						record.direction === "connector" && record.value.kind === "resume",
					error:
						record.direction === "connector" && record.value.kind === "resume"
							? new Error(decoder.decode(message))
							: undefined,
				})),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);

		expect(failure).toMatchObject({ code: "unavailable" });
		expect(collectPublicErrorText(failure)).not.toContain(resumeToken);
		expect(connector.peer.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-001 RPC-RECOVERY-003 RPC-RECOVERY-006 RPC-CORPUS-003 expires retained authority after token loss without sliding the deadline", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const originalNetwork = createRecoveryNetwork();
		const restartedNetwork = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 300,
		};
		const originalAcceptor = createRpcAcceptor({ runtimePolicy: policy });
		const restartedAcceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		originalAcceptor.expose(descriptor, {
			add: (left, right) => left + right,
		});

		await originalAcceptor.listen(originalNetwork.acceptorAdapter);
		await connector.connect({
			adapter: originalNetwork.createConnectorAdapter(),
		});
		originalNetwork.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});
		const recoveryStarted = Date.now();
		const pending = connector.peer.resolve(descriptor).add(20, 22);
		void pending.catch(() => {});
		await new Promise<void>((resolve) => setTimeout(resolve, 200));

		await restartedAcceptor.listen(restartedNetwork.acceptorAdapter);
		await expect(
			connector.connect({ adapter: restartedNetwork.createConnectorAdapter() }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(
			restartedNetwork.records.find(
				(record) =>
					record.direction === "acceptor" && record.value.kind === "reject",
			)?.value,
		).toMatchObject({ kind: "reject", code: "resume-rejected" });
		expect(connector.peer.state.status).toBe("recovering");
		expect(restartedAcceptor.peers).toHaveLength(0);

		await vi.waitFor(() => {
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "recovery-expired",
			});
		});
		expect(Date.now() - recoveryStarted).toBeLessThan(400);
		await expect(pending).rejects.toMatchObject({ code: "unavailable" });
		await Promise.all([
			connector.close(),
			originalAcceptor.close(),
			restartedAcceptor.close(),
		]);
	});
});
