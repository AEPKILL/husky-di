/**
 * @overview Default Protocol activity and send-progress Recovery behavior.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { NEVER } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RpcEndpointImpl } from "../../src/impls/protocol/rpc-endpoint.impl";
import { createRpcAcceptor, createRpcConnector } from "../../src/index";
import { createRpcTestNetwork } from "../protocol/test.utils";

const healthPolicy = {
	ackDelayMs: 1,
	activityProbeIntervalMs: 10,
	silenceTimeoutMs: 30,
	sendProgressTimeoutMs: 10,
};

describe("Default RPC Protocol health", () => {
	afterEach(() => vi.useRealTimers());

	it("RPC-WIRE-014 RPC-TIME-001 schedules an unsequenced Ping and a coalesced Pong after idle activity", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({ runtimePolicy: healthPolicy });
		const connector = createRpcConnector({ runtimePolicy: healthPolicy });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter());
		const activeStart = network.records.length;

		await vi.advanceTimersByTimeAsync(10);

		const activeRecords = network.records
			.slice(activeStart)
			.map(({ value }) => value);
		expect(activeRecords).toContainEqual({ kind: "ping" });
		expect(activeRecords).toContainEqual({ kind: "pong" });
		expect(
			activeRecords.every(
				(record) => !("seq" in record) && !("ackThrough" in record),
			),
		).toBe(true);

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-RECOVERY-001 RPC-TIME-002 fences a silent current binding before entering Recovery", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({ runtimePolicy: healthPolicy });
		const connector = createRpcConnector({ runtimePolicy: healthPolicy });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter("silent"));
		network.setInterceptor(() => ({ drop: true }));

		await vi.advanceTimersByTimeAsync(30);

		expect(connector.peer.state).toEqual({ status: "recovering" });
		expect(acceptor.peers[0]?.state).toEqual({ status: "recovering" });

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-TIME-003 grants one fresh probe-confirmation window after a late health callback", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({ runtimePolicy: healthPolicy });
		const connector = createRpcConnector({ runtimePolicy: healthPolicy });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter("silent"));
		const activeStart = network.records.length;
		network.setInterceptor(() => ({ drop: true }));
		vi.setSystemTime(Date.now() + 100);

		await vi.advanceTimersByTimeAsync(10);

		expect(connector.peer.state).toEqual({ status: "connected" });
		expect(
			network.records
				.slice(activeStart)
				.some(({ value }) => value.kind === "ping"),
		).toBe(true);
		await vi.advanceTimersByTimeAsync(9);
		expect(connector.peer.state).toEqual({ status: "connected" });
		await vi.advanceTimersByTimeAsync(1);
		expect(connector.peer.state).toEqual({ status: "recovering" });

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SCHEDULE-001 RPC-TIME-003 grants an unsettled send one fresh progress window after a late callback", async () => {
		vi.useFakeTimers();
		const failures: string[] = [];
		const endpoint = new RpcEndpointImpl({
			connection: {
				message$: NEVER,
				send: () => new Promise<void>(() => {}),
				async close() {},
			},
			onMessage: () => {},
			onFailure: (reason) => failures.push(reason),
		});
		endpoint.configureSendProgressTimeout(10);
		void endpoint.sendNow(new Uint8Array([1]));
		vi.setSystemTime(Date.now() + 100);

		await vi.advanceTimersByTimeAsync(10);

		expect(failures).toEqual([]);
		await vi.advanceTimersByTimeAsync(9);
		expect(failures).toEqual([]);
		await vi.advanceTimersByTimeAsync(1);
		expect(failures).toEqual(["connection"]);

		endpoint.fenceAndClose();
	});

	it("RPC-SCHEDULE-001 RPC-TIME-002 fences an unsettled send without reusing its slot RPC-CORPUS-004", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({ runtimePolicy: healthPolicy });
		const connector = createRpcConnector({ runtimePolicy: healthPolicy });
		const neverSettles = new Promise<void>(() => {});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect(network.createConnectorAdapter("silent"));
		network.setInterceptor((record) =>
			record.direction === "acceptor" && record.value.kind === "ping"
				? { drop: true, settlement: neverSettles }
				: undefined,
		);

		await vi.advanceTimersByTimeAsync(20);

		expect(acceptor.peers[0]?.state).toEqual({ status: "recovering" });
		expect(
			network.records.filter(
				(record) =>
					record.direction === "acceptor" && record.value.kind === "ping",
			),
		).toHaveLength(1);

		await Promise.all([connector.close(), acceptor.close()]);
	});
});
