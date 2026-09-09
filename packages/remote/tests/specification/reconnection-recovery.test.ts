/**
 * @overview Verifies reconnection recovery.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Observable, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type RpcProtocolConnectorFactory,
	RpcStateStatusEnum,
} from "../../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import {
	createReconnectionProtocolHarness,
	createSuccessfulConnectorAdapter,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-002 immediately reconnects a recovering Peer with a fresh Adapter", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		let sessionHost: IRpcProtocolSessionHost | undefined;
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
			return {
				bind() {
					return Promise.resolve().then(() => {
						if (sessionHost === undefined) {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("The test Session was not attached.");
							}
							return;
						}
						sessionHost.transition({
							type: RpcProtocolSessionTransitionTypeEnum.recovered,
						});
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({ protocolFactory });
		const adapters: IRpcConnectorAdapter[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				const connectionSource = new Subject<IRpcConnection>();
				const adapter: IRpcConnectorAdapter = {
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
				adapters.push(adapter);
				return adapter;
			},
		});
		await reconnection.connect();

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		expect(reconnection.state).toEqual({
			status: "reconnecting",
			attempt: 1,
		});
		expect(adapters).toHaveLength(1);
		await vi.waitFor(() => {
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
		expect(adapters).toHaveLength(2);
		expect(adapters[1]).not.toBe(adapters[0]);
		expect(connector.peer.state).toEqual({ status: "connected" });

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(reconnection.state).toEqual({
			status: "reconnecting",
			attempt: 1,
		});
		await vi.waitFor(() => {
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
		expect(adapters).toHaveLength(3);
	});

	it("RPC-RECONNECT-002 does not lose a new Recovery before replacement settlement", async () => {
		const peerStateSource = new Subject<{
			readonly status: RpcStateStatusEnum;
		}>();
		let peerState: { readonly status: RpcStateStatusEnum } = {
			status: RpcStateStatusEnum.unbound,
		};
		let connectorCalls = 0;
		const connector = {
			state: { status: RpcStateStatusEnum.active },
			state$: new Observable((subscriber) => {
				subscriber.next({ status: RpcStateStatusEnum.active });
			}),
			peer: {
				get state() {
					return peerState;
				},
				state$: new Observable((subscriber) => {
					subscriber.next(peerState);
					return peerStateSource.subscribe(subscriber);
				}),
			},
			connect() {
				connectorCalls += 1;
				peerState = { status: RpcStateStatusEnum.connected };
				peerStateSource.next(peerState);
				const task = Promise.resolve();
				if (connectorCalls === 2) {
					void task.then(() => {
						peerState = { status: RpcStateStatusEnum.recovering };
						peerStateSource.next(peerState);
					});
				}
				return task;
			},
		} as unknown as IRpcConnector;
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				return createSuccessfulConnectorAdapter();
			},
		});
		await reconnection.connect();
		peerState = { status: RpcStateStatusEnum.recovering };
		peerStateSource.next(peerState);

		await vi.waitFor(() => {
			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
	});

	it("RPC-RECONNECT-003 waits the configured exact delay before a later retry", async () => {
		vi.useFakeTimers();
		try {
			const session: IRpcProtocolSession = {
				prepareInvocation: () => undefined,
				forceClose() {},
			};
			let sessionHost: IRpcProtocolSessionHost | undefined;
			const protocolFactory: RpcProtocolConnectorFactory = (host) => {
				return {
					bind() {
						return Promise.resolve().then(() => {
							if (sessionHost === undefined) {
								sessionHost = host.attachSession(session);
								if (sessionHost === undefined) {
									throw new Error("The test Session was not attached.");
								}
								return;
							}
							sessionHost.transition({
								type: RpcProtocolSessionTransitionTypeEnum.recovered,
							});
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			};
			const connector = createRpcConnector({ protocolFactory });
			let factoryCalls = 0;
			const retryDelaysMs = [100];
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					const connectionSource = new Subject<IRpcConnection>();
					return {
						connection$: connectionSource.asObservable(),
						async connect() {
							if (factoryCalls === 2) {
								const error = new Error("Replacement failed.");
								connectionSource.error(error);
								throw error;
							}
							connectionSource.next({
								message$: new Subject<Uint8Array>().asObservable(),
								async send() {},
								async close() {},
							});
							connectionSource.complete();
						},
					};
				},
				policy: {
					retryDelaysMs,
					attemptTimeoutMs: 1_000,
				},
			});
			const failures: unknown[] = [];
			reconnection.event$.subscribe((event) =>
				failures.push({ event, state: reconnection.state }),
			);
			retryDelaysMs[0] = 0;
			await reconnection.connect();

			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(2);
			expect(reconnection.state).toEqual({
				status: "waiting",
				nextAttempt: 2,
				delayMs: 100,
			});
			expect(failures).toEqual([
				{
					event: {
						type: "attempt-failed",
						attempt: 1,
						stage: "connector-attempt",
						nextDelayMs: 100,
					},
					state: {
						status: "waiting",
						nextAttempt: 2,
						delayMs: 100,
					},
				},
			]);
			await vi.advanceTimersByTimeAsync(99);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
			expect(connector.peer.state).toEqual({ status: "connected" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-003 aborts a replacement attempt at its configured timeout", async () => {
		vi.useFakeTimers();
		try {
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({
				protocolFactory: harness.protocolFactory,
			});
			let factoryCalls = 0;
			let replacementSignal: AbortSignal | undefined;
			const failures: unknown[] = [];
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
				policy: { retryDelaysMs: [], attemptTimeoutMs: 50 },
			});
			reconnection.event$.subscribe((event) => failures.push(event));
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			expect(replacementSignal?.aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(49);
			expect(reconnection.state).toEqual({
				status: "reconnecting",
				attempt: 1,
			});
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(replacementSignal?.aborted).toBe(true);
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "retries-exhausted",
			});
			expect(failures).toEqual([
				{
					type: "attempt-failed",
					attempt: 1,
					stage: "attempt-timeout",
				},
			]);
			expect(connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-003 preserves exact delays beyond one platform timer range", async () => {
		vi.useFakeTimers();
		try {
			const maximumTimerDelayMs = 2_147_483_647;
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({
				protocolFactory: harness.protocolFactory,
			});
			let factoryCalls = 0;
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					if (factoryCalls !== 2) {
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
				policy: {
					retryDelaysMs: [maximumTimerDelayMs + 10],
					attemptTimeoutMs: 1_000,
				},
			});
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			await vi.advanceTimersByTimeAsync(maximumTimerDelayMs);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(9);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
		} finally {
			vi.useRealTimers();
		}
	});
});
