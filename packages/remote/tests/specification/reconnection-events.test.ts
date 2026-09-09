/**
 * @overview Verifies reconnection events.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
} from "../../src/index";
import type { IRpcConnection } from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import {
	createReconnectionProtocolHarness,
	createSuccessfulConnectorAdapter,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-005 emits payload-free failure telemetry after the resulting state", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.protocolFactory,
		});
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						const error = new Error("credential=secret");
						connectionSource.error(error);
						throw error;
					},
				};
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 100 },
		});
		const observations: string[] = [];
		const events: unknown[] = [];
		reconnection.state$.subscribe((state) => {
			if (state.status === "stopped") {
				observations.push("state");
			}
		});
		reconnection.event$.subscribe({
			next: (event) => {
				observations.push("event");
				events.push(event);
			},
			complete: () => observations.push("event-complete"),
		});
		await reconnection.connect();
		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		await vi.waitFor(() => {
			expect(reconnection.state.status).toBe("stopped");
		});
		expect(events).toEqual([
			{
				type: "attempt-failed",
				attempt: 1,
				stage: "connector-attempt",
			},
		]);
		expect(observations).toEqual(["state", "event", "event-complete"]);
		expect(JSON.stringify(events)).not.toContain("secret");
	});

	it("RPC-RECONNECT-005 classifies a background Adapter Factory failure", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.protocolFactory,
		});
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				throw new Error("endpoint=https://secret.example");
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 100 },
		});
		const events: unknown[] = [];
		reconnection.event$.subscribe((event) => events.push(event));
		await reconnection.connect();

		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		await vi.waitFor(() => {
			expect(reconnection.state.status).toBe("stopped");
		});

		expect(events).toEqual([
			{
				type: "attempt-failed",
				attempt: 1,
				stage: "adapter-factory",
			},
		]);
		expect(JSON.stringify(events)).not.toContain("secret");
	});
});
