/**
 * @overview Verifies connector transition.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { createRpcConnector, RpcCloseReasonEnum } from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../src/protocol";
import { createColdProtocol } from "./connector/test.utils";

describe("Connector termination cleanup", () => {
	it("RPC-CLEANUP-002 RPC-CLEANUP-003 preserves an interrupted Adapter startup cleanup rejection", async () => {
		const startupError = new Error("Adapter startup cleanup failed");
		const connectionSource = new Subject<IRpcConnection>();
		const connector = createRpcConnector({
			protocolFactory: createColdProtocol(),
		});
		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				connect(signal) {
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener(
							"abort",
							() => {
								connectionSource.complete();
								reject(startupError);
							},
							{ once: true },
						);
					});
				},
			},
		});

		const termination = connector.close();
		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		await expect(termination).rejects.toBe(startupError);
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: startupError,
		});
	});

	it("RPC-CLEANUP-003 reuses one trusted cleanup Error", async () => {
		const cleanupError = new Error("cleanup failed");
		const connector = createRpcConnector({
			protocolFactory: createColdProtocol({
				cleanup: () => Promise.reject(cleanupError),
			}),
		});

		await expect(connector.close()).rejects.toBe(cleanupError);
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: cleanupError,
		});
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 bounds a non-settling cleanup RPC-CORPUS-004", async () => {
		vi.useFakeTimers();
		try {
			const connector = createRpcConnector({
				protocolFactory: createColdProtocol({
					cleanup: () => new Promise<void>(() => {}),
				}),
				runtimePolicy: { shutdownDeadlineMs: 5 },
			});
			const termination = connector.close();
			const rejection = expect(termination).rejects.toThrow(
				"cleanup exceeded its deadline",
			);

			await vi.advanceTimersByTimeAsync(5);
			await rejection;
			expect(connector.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 aggregates an admitted cleanup Error before deadline timeout", async () => {
		vi.useFakeTimers();
		try {
			const closeError = new Error("Connection cleanup failed first");
			const connectionSource = new Subject<IRpcConnection>();
			const session: IRpcProtocolSession = {
				prepareInvocation: () => undefined,
				forceClose() {},
			};
			const connector = createRpcConnector({
				protocolFactory(host) {
					return {
						bind() {
							return Promise.resolve().then(() => {
								if (host.attachSession(session) === undefined) {
									throw new Error("Expected a fresh Session attachment.");
								}
							});
						},
						async shutdown() {},
						close() {},
						cleanup: () => new Promise<void>(() => {}),
					};
				},
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			await connector.connect({
				adapter: {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							close: () => Promise.reject(closeError),
						});
						connectionSource.complete();
					},
				},
			});

			const outcome = connector.close().then(
				() => undefined,
				(error: unknown) => error,
			);
			await vi.advanceTimersByTimeAsync(10);
			const failure = await outcome;

			expect(failure).toBeInstanceOf(AggregateError);
			const errors = (failure as AggregateError).errors;
			expect(errors[0]).toBe(closeError);
			expect(errors[1]).toMatchObject({
				message: "RPC Owner cleanup exceeded its deadline.",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-COUNTER-004 RPC-STATE-002 keeps counter exhaustion failed after graceful owner shutdown", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let sessionHost: IRpcProtocolSessionHost | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const connector = createRpcConnector({
			protocolFactory(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("Expected a fresh Session attachment.");
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		});
		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});
		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});

		await connector.shutdown();

		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "counter-exhaustion",
			error: { code: "unavailable" },
		});
		expect(connector.state).toMatchObject(connector.peer.state);
		expect(Reflect.get(connector.state, "error")).toBe(
			Reflect.get(connector.peer.state, "error"),
		);
	});

	it("RPC-STATE-001 RPC-SPI-010 permits counter drain from a retained recovering Session", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let sessionHost: IRpcProtocolSessionHost | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const connector = createRpcConnector({
			protocolFactory(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("Expected a fresh Session attachment.");
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		});
		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});

		expect(connector.peer.state).toEqual({
			status: "draining",
			reason: "counter-exhaustion",
		});
		await connector.close();
	});

	it.each([
		RpcCloseReasonEnum.recoveryExpired,
		RpcCloseReasonEnum.counterExhaustion,
		RpcCloseReasonEnum.gracefulShutdown,
	] as const)("RPC-STATE-001 RPC-SPI-010 faults a connected Session that requests %s terminal", async (reason) => {
		const connectionSource = new Subject<IRpcConnection>();
		let sessionHost: IRpcProtocolSessionHost | undefined;
		let forceCalls = 0;
		let runtimeCloseCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const connector = createRpcConnector({
			protocolFactory(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("Expected a fresh Session attachment.");
							}
						});
					},
					async shutdown() {},
					close() {
						runtimeCloseCalls += 1;
					},
					async cleanup() {},
				};
			},
		});
		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason,
		});

		expect(forceCalls).toBe(1);
		expect(runtimeCloseCalls).toBe(0);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { code: "protocol" },
		});
		await connector.close();
	});

	it("RPC-API-005 RPC-LIFE-001 RPC-SPI-010 keeps an invalid closed transition authoritative over reentrant shutdown", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let sessionHost: IRpcProtocolSessionHost | undefined;
		let forceCalls = 0;
		let runtimeShutdownCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const connector = createRpcConnector({
			protocolFactory(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("Expected a fresh Session attachment.");
							}
						});
					},
					async shutdown() {
						runtimeShutdownCalls += 1;
					},
					close() {},
					async cleanup() {},
				};
			},
		});
		const events: string[] = [];
		connector.event$.subscribe((event) => events.push(event.type));
		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});

		let shutdownTask: Promise<void> | undefined;
		connector.peer.state$.subscribe((state) => {
			if (state.status !== "recovering") {
				return;
			}
			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.gracefulShutdown,
			});
			shutdownTask = connector.shutdown();
		});

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		if (shutdownTask === undefined) {
			throw new Error(
				"Expected shutdown to reenter the recovering notification.",
			);
		}
		expect(connector.shutdown()).toBe(shutdownTask);
		expect(connector.close()).toBe(shutdownTask);
		await shutdownTask;

		expect(forceCalls).toBe(1);
		expect(runtimeShutdownCalls).toBe(0);
		expect(events).not.toContain("owner-draining");
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { code: "protocol" },
		});
		expect(connector.state).toMatchObject(connector.peer.state);
	});
});
