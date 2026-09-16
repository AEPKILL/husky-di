/**
 * @overview Verifies reconnection startup.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { of, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcReconnectionConnector,
	type RpcInterceptor,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type { IRpcConnection, IRpcProtocolSession } from "../../src/protocol";
import {
	createProtocolHarness,
	createSuccessfulConnectorAdapter,
	IDeferredService,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-001 creates a cold Connector with its Protocol, runtime policy, and interceptor", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const protocolFactory = vi.fn<RpcProtocolConnectorFactory>((host) => {
			expect(host.policy.maxPendingInvocationsPerSession).toBe(3);
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
		});
		const interceptor = vi.fn<RpcInterceptor>(() => of(42));
		let factoryCalls = 0;
		const reconnection = createRpcReconnectionConnector({
			protocolFactory,
			runtimePolicy: { maxPendingInvocationsPerSession: 3 },
			interceptor,
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
		const connector = reconnection.connector;
		const states: string[] = [];
		reconnection.state$.subscribe((state) => states.push(state.status));

		expect(connector.state).toEqual({ status: "active" });
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(reconnection.state).toEqual({ status: "idle" });
		expect(factoryCalls).toBe(0);
		expect(protocolFactory).toHaveBeenCalledTimes(1);
		expect(interceptor).not.toHaveBeenCalled();
		await reconnection.connect();

		expect(reconnection.connector).toBe(connector);
		expect(factoryCalls).toBe(1);
		expect(reconnection.state).toEqual({ status: "monitoring" });
		expect(states).toEqual(["idle", "connecting", "monitoring"]);
		await expect(reconnection.connect()).rejects.toMatchObject({
			code: "unavailable",
		});
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.reconnection-options.v1",
			members: { run: { kind: "function" } },
		});
		await expect(connector.peer.resolve(descriptor).run(1)).resolves.toBe(42);
		expect(interceptor).toHaveBeenCalledTimes(1);
		await reconnection.stop();
		await connector.close();
	});

	it("RPC-RECONNECT-001 creates a distinct Connector and Peer for each supervisor", async () => {
		const harness = createProtocolHarness();
		const options = {
			protocolFactory: harness.connectorFactory,
			adapterFactory: createSuccessfulConnectorAdapter,
		};
		const first = createRpcReconnectionConnector(options);
		const second = createRpcReconnectionConnector(options);

		expect(second.connector).not.toBe(first.connector);
		expect(second.connector.peer).not.toBe(first.connector.peer);
		expect(harness.connectorHosts).toHaveLength(2);
		expect(harness.calls.connectorBind).toBe(0);
		await Promise.all([first.stop(), second.stop()]);
		await Promise.all([first.connector.close(), second.connector.close()]);
	});

	it("RPC-RECONNECT-001 terminates after an initial Adapter Factory failure", async () => {
		const cause = new Error("Factory failed.");
		const reconnection = createRpcReconnectionConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
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
		let factoryCalls = 0;
		const events: unknown[] = [];
		const reconnection = createRpcReconnectionConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
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
		let adapterSignal: AbortSignal | undefined;
		const events: unknown[] = [];
		let eventsCompleted = false;
		const reconnection = createRpcReconnectionConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
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
		const connector = reconnection.connector;
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
		const reconnection = createRpcReconnectionConnector({
			protocolFactory: createProtocolHarness().connectorFactory,
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
