/**
 * @overview Verifies reconnection startup.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type { IRpcConnection, IRpcProtocolSession } from "../../src/protocol";
import { createProtocolHarness } from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-001 owns one initial connection and publishes its orchestration state", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
			return {
				bind() {
					return Promise.resolve().then(() => {
						if (host.attachSession(session) === undefined) {
							throw new Error("The test Session was not attached.");
						}
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({ protocolFactory });
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {},
						});
						connectionSource.complete();
					},
				};
			},
		});
		const states: string[] = [];
		reconnection.state$.subscribe((state) => states.push(state.status));

		expect(reconnection.connector).toBe(connector);
		expect(reconnection.state).toEqual({ status: "idle" });
		await reconnection.connect();

		expect(factoryCalls).toBe(1);
		expect(reconnection.state).toEqual({ status: "monitoring" });
		expect(states).toEqual(["idle", "connecting", "monitoring"]);
		await expect(reconnection.connect()).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	it("RPC-RECONNECT-001 terminates after an initial Adapter Factory failure", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		const cause = new Error("Factory failed.");
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				throw cause;
			},
		});
		let stateCompleted = false;
		reconnection.state$.subscribe({
			complete: () => {
				stateCompleted = true;
			},
		});

		await expect(reconnection.connect()).rejects.toBe(cause);

		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "initial-connection-failed",
		});
		expect(stateCompleted).toBe(true);
	});

	it("RPC-RECONNECT-001 does not retry an ordinary initial Connector failure", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		let factoryCalls = 0;
		const events: unknown[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						const error = new Error("Initial attempt failed.");
						connectionSource.error(error);
						throw error;
					},
				};
			},
			policy: { retryDelaysMs: [0, 0], attemptTimeoutMs: 1 },
		});
		reconnection.event$.subscribe((event) => events.push(event));

		await expect(reconnection.connect()).rejects.toMatchObject({
			code: "unavailable",
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 5));

		expect(factoryCalls).toBe(1);
		expect(events).toEqual([]);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "initial-connection-failed",
		});
	});

	it("RPC-RECONNECT-004 reports Connector termination during the initial attempt", async () => {
		const connector = createRpcConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
		});
		let adapterSignal: AbortSignal | undefined;
		const events: unknown[] = [];
		let eventsCompleted = false;
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
		reconnection.event$.subscribe({
			next: (event) => events.push(event),
			complete: () => {
				eventsCompleted = true;
			},
		});
		const connectTask = reconnection.connect();

		const closeTask = connector.close();
		await expect(connectTask).rejects.toMatchObject({ name: "AbortError" });
		await closeTask;

		expect(adapterSignal?.aborted).toBe(true);
		expect(events).toEqual([]);
		expect(eventsCompleted).toBe(true);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "connector-terminated",
		});
	});

	it("RPC-RECONNECT-002 replays its frozen terminal state to a late subscriber", async () => {
		const reconnection = createRpcConnectorReconnection({
			connector: createRpcConnector({
				protocolFactory: createProtocolHarness().connectorFactory,
			}),
			adapterFactory: () => {
				throw new Error("Factory failed.");
			},
		});
		await reconnection.connect().catch(() => {});
		const observations: unknown[] = [];

		reconnection.state$.subscribe({
			next: (state) => observations.push(state),
			complete: () => observations.push("complete"),
		});

		expect(Object.isFrozen(reconnection.state)).toBe(true);
		expect(observations).toEqual([
			{
				status: "stopped",
				reason: "initial-connection-failed",
			},
			"complete",
		]);
	});
});
