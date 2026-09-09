/**
 * @overview Verifies reconnection stop.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
	RpcStateStatusEnum,
} from "../../src/index";
import type { IRpcConnection } from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import {
	createProtocolHarness,
	createReconnectionProtocolHarness,
	createSuccessfulConnectorAdapter,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-004 stops a scheduled retry without closing its Connector", async () => {
		vi.useFakeTimers();
		try {
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
							const error = new Error("Replacement failed.");
							connectionSource.error(error);
							throw error;
						},
					};
				},
				policy: { retryDelaysMs: [1_000], attemptTimeoutMs: 100 },
			});
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(reconnection.state.status).toBe("waiting");

			const stopTask = reconnection.stop();
			expect(reconnection.stop()).toBe(stopTask);
			await stopTask;
			await vi.advanceTimersByTimeAsync(1_000);

			expect(factoryCalls).toBe(2);
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(connector.state).toEqual({ status: "active" });
			expect(connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-004 stops an active replacement before direct Connector takeover", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.protocolFactory,
		});
		let factoryCalls = 0;
		let replacementSignal: AbortSignal | undefined;
		const events: unknown[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				return {
					connection$: new Subject<IRpcConnection>().asObservable(),
					connect(signal) {
						replacementSignal = signal;
						return new Promise<void>((_resolve, reject) => {
							signal.addEventListener(
								"abort",
								() =>
									reject(new DOMException("Adapter aborted.", "AbortError")),
								{ once: true },
							);
						});
					},
				};
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 1_000 },
		});
		reconnection.event$.subscribe((event) => events.push(event));
		await reconnection.connect();
		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		await Promise.resolve();
		expect(replacementSignal?.aborted).toBe(false);

		const stopTask = reconnection.stop();
		expect(replacementSignal?.aborted).toBe(true);
		await stopTask;

		expect(events).toEqual([]);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "requested",
		});
		expect(connector.peer.state).toEqual({ status: "recovering" });
		await connector.connect({ adapter: createSuccessfulConnectorAdapter() });
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-RECONNECT-004 stops and awaits an unsettled initial connection attempt", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		let adapterSignal: AbortSignal | undefined;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => ({
				connection$: new Subject<IRpcConnection>().asObservable(),
				connect(signal) {
					adapterSignal = signal;
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener(
							"abort",
							() => reject(new DOMException("Adapter aborted.", "AbortError")),
							{ once: true },
						);
					});
				},
			}),
		});
		const connectTask = reconnection.connect();
		let reentrantStopTask: Promise<void> | undefined;
		reconnection.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.stopped) {
				reentrantStopTask = reconnection.stop();
			}
		});

		const stopTask = reconnection.stop();
		try {
			expect(reconnection.stop()).toBe(stopTask);
			expect(reentrantStopTask).toBe(stopTask);
			expect(adapterSignal?.aborted).toBe(true);
			await expect(connectTask).rejects.toMatchObject({ name: "AbortError" });
			await expect(stopTask).resolves.toBeUndefined();
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(connector.peer.state).toEqual({ status: "unbound" });
		} finally {
			await connector.close();
			await connectTask.catch(() => {});
		}
	});

	it("RPC-RECONNECT-004 leaves no retry timer when stop wins from the waiting projection", async () => {
		vi.useFakeTimers();
		try {
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
							const error = new Error("Replacement failed.");
							connectionSource.error(error);
							throw error;
						},
					};
				},
				policy: { retryDelaysMs: [60_000], attemptTimeoutMs: 1_000 },
			});
			let stopTask: Promise<void> | undefined;
			reconnection.state$.subscribe((state) => {
				if (state.status === RpcStateStatusEnum.waiting) {
					stopTask = reconnection.stop();
				}
			});
			await reconnection.connect();

			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			await expect(stopTask).resolves.toBeUndefined();
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-004 observes Connector termination reentrant from monitoring", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: harness.protocolFactory,
		});
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: createSuccessfulConnectorAdapter,
		});
		let connectorCloseTask: Promise<void> | undefined;
		reconnection.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.monitoring) {
				connectorCloseTask = connector.close();
			}
		});

		await reconnection.connect();
		await connectorCloseTask;

		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "connector-terminated",
		});
	});
});
