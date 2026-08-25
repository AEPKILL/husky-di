/**
 * @overview Connector termination and owned-cleanup compliance tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
	createRpcConnector,
	type IRpcProtocol,
	RpcCloseReasonEnum,
} from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../src/protocol";

function createColdProtocol(overrides?: {
	readonly cleanup?: () => Promise<void>;
}): IRpcProtocol {
	return {
		createConnector() {
			return {
				async bind() {},
				async shutdown() {},
				close() {},
				cleanup: overrides?.cleanup ?? (async () => {}),
			};
		},
		createAcceptor() {
			return {
				async accept() {},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		},
	};
}

describe("Connector termination cleanup", () => {
	it.each([
		"close",
		"shutdown",
	] as const)("RPC-CLOSE-003 RPC-SHUTDOWN-001 %s fences the attempt before abort can reenter handoff", async (method) => {
		const connectionSource = new Subject<IRpcConnection>();
		let bindCalls = 0;
		let closeCalls = 0;
		const connector = createRpcConnector({
			protocol: {
				createConnector() {
					return {
						async bind() {
							bindCalls += 1;
						},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
				createAcceptor() {
					return {
						async accept() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
			},
		});
		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				connect(signal) {
					return new Promise<void>((resolve) => {
						signal.addEventListener(
							"abort",
							() => {
								connectionSource.next({
									message$: new Subject<Uint8Array>().asObservable(),
									async send() {},
									async close() {
										closeCalls += 1;
									},
								});
								connectionSource.complete();
								resolve();
							},
							{ once: true },
						);
					});
				},
			},
		});

		const termination = connector[method]();

		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		await termination;
		expect(bindCalls).toBe(0);
		expect(closeCalls).toBe(0);
	});

	it.each([
		"startup",
		"source",
	] as const)("RPC-START-002 RPC-START-004 keeps a fresh Session provisional through %s failure", async (failureKind) => {
		const failure = new Error(`${failureKind} failed`);
		const forceCalls = [0, 0];
		const closeCalls = [0, 0];
		const sessions: IRpcProtocolSession[] = forceCalls.map((_, index) => ({
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls[index] += 1;
			},
		}));
		let binding = 0;
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						const session = sessions[binding];
						binding += 1;
						return Promise.resolve().then(() => {
							if (
								session === undefined ||
								host.attachSession(session) === undefined
							) {
								throw new Error("Expected a fresh Session attachment.");
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const connector = createRpcConnector({ protocol });
		const events: string[] = [];
		connector.event$.subscribe((event) => events.push(event.type));
		const createAdapter = (index: number, kind?: "startup" | "source") => {
			const connectionSource = new Subject<IRpcConnection>();
			return {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {
							closeCalls[index] += 1;
						},
					});
					await Promise.resolve();
					if (kind === "source") {
						connectionSource.error(failure);
						return;
					}
					connectionSource.complete();
					if (kind === "startup") {
						throw failure;
					}
				},
			};
		};

		await expect(
			connector.connect({ adapter: createAdapter(0, failureKind) }),
		).rejects.toMatchObject({ code: "unavailable", cause: failure });
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(forceCalls[0]).toBe(1);
		expect(closeCalls[0]).toBe(1);
		expect(events).toEqual([]);

		await connector.connect({ adapter: createAdapter(1) });
		expect(connector.peer.state).toEqual({ status: "connected" });
		expect(events).toEqual(["peer-opened"]);
		await connector.close();
	});

	it("RPC-START-004 RPC-SPI-011 faults a provisional fresh Session without publishing it", async () => {
		let sessionHost: IRpcProtocolSessionHost | undefined;
		let forceCalls = 0;
		const fault = new Error("fresh Session proof invariant failed");
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
				sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason: RpcCloseReasonEnum.forcedClose,
				});
			},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							sessionHost = host.attachSession(session);
							if (sessionHost === undefined) {
								throw new Error("Expected a provisional Session host.");
							}
							sessionHost.fault(RpcCloseReasonEnum.protocolFault, fault);
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				throw new Error("Acceptor runtime is not used by this test.");
			},
		};
		const connector = createRpcConnector({ protocol });
		const connectionSource = new Subject<IRpcConnection>();

		const startup = connector.connect({
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

		await expect(startup).rejects.toMatchObject({
			code: "protocol",
			cause: fault,
		});
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(connector.state).toEqual({ status: "active" });
		await connector.close();
	});

	it.each([
		"closed transition",
		"Session fault",
		"invalid transition",
	] as const)("RPC-RECOVERY-002 RPC-SPI-011 RPC-STATE-001 %s aborts an in-flight recovery connect", async (terminalKind) => {
		let bindCalls = 0;
		let recoverySignal: AbortSignal | undefined;
		let sessionHost: IRpcProtocolSessionHost | undefined;
		let forceCalls = 0;
		let runtimeCloseCalls = 0;
		const fault = new Error("Session resource fault");
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
				if (terminalKind === "Session fault") {
					sessionHost?.transition({
						type: RpcProtocolSessionTransitionTypeEnum.closed,
						reason: RpcCloseReasonEnum.remoteTerminated,
					});
				}
			},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind(connection, signal) {
						connection.message$.subscribe();
						bindCalls += 1;
						if (bindCalls === 1) {
							return Promise.resolve().then(() => {
								sessionHost = host.attachSession(session);
								if (sessionHost === undefined) {
									throw new Error("Expected a fresh Session attachment.");
								}
							});
						}
						recoverySignal = signal;
						return new Promise<void>(() => {});
					},
					async shutdown() {},
					close() {
						runtimeCloseCalls += 1;
					},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const connector = createRpcConnector({ protocol });
		const connect = (onClose?: () => void) => {
			const connectionSource = new Subject<IRpcConnection>();
			return connector.connect({
				adapter: {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {
								onClose?.();
							},
						});
						connectionSource.complete();
					},
				},
			});
		};
		await connect();
		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		let recoveryCloseCalls = 0;
		const recovery = connect(() => {
			recoveryCloseCalls += 1;
		});
		await Promise.resolve();

		if (terminalKind === "closed transition") {
			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});
		} else if (terminalKind === "Session fault") {
			sessionHost?.fault(RpcCloseReasonEnum.resourceFault, fault);
		} else {
			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
		}

		expect(recoverySignal?.aborted).toBe(true);
		await expect(recovery).rejects.toMatchObject({ name: "AbortError" });
		expect(recoveryCloseCalls).toBe(1);
		expect(forceCalls).toBe(terminalKind === "closed transition" ? 0 : 1);
		expect(runtimeCloseCalls).toBe(0);
		await connector.close();
		if (terminalKind === "closed transition") {
			expect(connector.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "remote-terminated",
			});
		} else if (terminalKind === "Session fault") {
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "resource-fault",
				error: { code: "protocol", cause: fault },
			});
			expect(connector.state).toMatchObject(connector.peer.state);
		} else {
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "protocol-fault",
				error: { code: "protocol" },
			});
			expect(connector.state).toMatchObject(connector.peer.state);
		}
	});

	it("RPC-SHUTDOWN-001 RPC-CLOSE-003 interrupts an admitted startup without waiting for Protocol bind", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSource = new Subject<Uint8Array>();
		let closeCalls = 0;
		let connectorSignal: AbortSignal | undefined;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					bind(connection) {
						connection.message$.subscribe();
						return new Promise<void>(() => {});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const connector = createRpcConnector({ protocol });
		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect(signal) {
					connectorSignal = signal;
					connectionSource.next({
						message$: messageSource.asObservable(),
						async send() {},
						async close() {
							closeCalls += 1;
						},
					});
					connectionSource.complete();
				},
			},
		});
		await Promise.resolve();

		const termination = connector.close();
		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		expect(connectorSignal?.aborted).toBe(true);
		expect(closeCalls).toBe(1);
		await termination;
	});

	it("RPC-CLEANUP-002 waits for the handed-off Connection by resource identity", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSource = new Subject<Uint8Array>();
		let resolveClose!: () => void;
		const closeTask = new Promise<void>((resolve) => {
			resolveClose = resolve;
		});
		let closeCalls = 0;
		const connection: IRpcConnection = {
			message$: messageSource.asObservable(),
			async send() {},
			close() {
				closeCalls += 1;
				return closeTask;
			},
		};
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				return undefined;
			},
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind(ownedConnection) {
						ownedConnection.message$.subscribe();
						return Promise.resolve().then(() => {
							if (host.attachSession(session) === undefined) {
								throw new Error("Expected Session attachment.");
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const connector = createRpcConnector({ protocol });
		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next(connection);
					connectionSource.complete();
				},
			},
		});

		let settled = false;
		const termination = connector.close().finally(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(closeCalls).toBe(1);
		expect(settled).toBe(false);

		resolveClose();
		await termination;
		expect(closeCalls).toBe(1);
	});

	it("RPC-CLEANUP-002 RPC-CLEANUP-003 preserves a Connection cleanup rejection that settles before termination", async () => {
		const closeError = new Error("early Connection cleanup failed");
		const connectionSource = new Subject<IRpcConnection>();
		const connector = createRpcConnector({ protocol: createColdProtocol() });

		await expect(
			connector.connect({
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
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		await Promise.resolve();

		await expect(connector.close()).rejects.toBe(closeError);
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: closeError,
		});
	});

	it("RPC-RESOURCE-006 RPC-CLEANUP-002 keeps failed Direct Closes inside the Connection cap", async () => {
		let sessionHost: IRpcProtocolSessionHost | undefined;
		let bindCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind(connection) {
						connection.message$.subscribe();
						bindCalls += 1;
						return Promise.resolve().then(() => {
							if (bindCalls === 1) {
								sessionHost = host.attachSession(session);
								if (sessionHost === undefined) {
									throw new Error("Expected a fresh Session attachment.");
								}
							} else {
								sessionHost?.transition({
									type: RpcProtocolSessionTransitionTypeEnum.recovered,
								});
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				throw new Error("Acceptor runtime is not used by this test.");
			},
		};
		const connector = createRpcConnector({ protocol });
		const closeErrors = [
			new Error("first native close failed"),
			new Error("second native close failed"),
			new Error("third native close failed"),
		];
		const connectAndLose = async (index: number): Promise<void> => {
			const connectionSource = new Subject<IRpcConnection>();
			const messageSource = new Subject<Uint8Array>();
			await connector.connect({
				adapter: {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: messageSource.asObservable(),
							async send() {},
							close: () => Promise.reject(closeErrors[index]),
						});
						connectionSource.complete();
					},
				},
			});
			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			messageSource.complete();
			await Promise.resolve();
			await Promise.resolve();
		};
		for (let index = 0; index < closeErrors.length; index += 1) {
			await connectAndLose(index);
		}

		let fourthStartupCalls = 0;
		const fourthConnectionSource = new Subject<IRpcConnection>();
		await expect(
			connector.connect({
				adapter: {
					connection$: fourthConnectionSource.asObservable(),
					async connect() {
						fourthStartupCalls += 1;
						fourthConnectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {},
						});
						fourthConnectionSource.complete();
					},
				},
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(bindCalls).toBe(3);
		expect(fourthStartupCalls).toBe(0);
		const cleanupFailure = await connector.close().then(
			() => undefined,
			(error: unknown) => error,
		);
		expect(cleanupFailure).toBeInstanceOf(AggregateError);
		expect((cleanupFailure as AggregateError).errors).toEqual(closeErrors);
	});

	it("RPC-CLEANUP-002 RPC-CLEANUP-003 preserves an interrupted Adapter startup cleanup rejection", async () => {
		const startupError = new Error("Adapter startup cleanup failed");
		const connectionSource = new Subject<IRpcConnection>();
		const connector = createRpcConnector({ protocol: createColdProtocol() });
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
			protocol: createColdProtocol({
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
				protocol: createColdProtocol({
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
				reserveInvocation: () => undefined,
				forceClose() {},
			};
			const connector = createRpcConnector({
				protocol: {
					createConnector(host) {
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
					createAcceptor() {
						return {
							async accept() {},
							async shutdown() {},
							close() {},
							async cleanup() {},
						};
					},
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
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const connector = createRpcConnector({
			protocol: {
				createConnector(host) {
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
				createAcceptor() {
					return {
						async accept() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
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
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const connector = createRpcConnector({
			protocol: {
				createConnector(host) {
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
				createAcceptor() {
					return {
						async accept() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
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
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const connector = createRpcConnector({
			protocol: {
				createConnector(host) {
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
				createAcceptor() {
					return {
						async accept() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
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
});
