/**
 * @overview Acceptor owned-resource cleanup compliance tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	type IRpcProtocol,
} from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolAcceptorHost,
	IRpcProtocolSession,
} from "../src/protocol";

interface FaultingService {
	run(): Promise<void>;
}

const IFaultingService =
	createServiceIdentifier<FaultingService>("IFaultingService");

describe("Acceptor termination cleanup", () => {
	it("RPC-SPI-011 keeps the initiating Session fault authoritative across reentrant force", () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let sessionHost:
			| ReturnType<IRpcProtocolAcceptorHost["admitSession"]>
			| undefined;
		const fault = new Error("authenticated active Session violation");
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor(host) {
				protocolHost = host;
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		sessionHost = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {
				sessionHost?.transition({
					type: "closed",
					reason: "forced-close",
				});
			},
		});
		const peer = acceptor.peers[0];
		if (sessionHost === undefined || peer === undefined) {
			throw new Error("Expected an admitted Acceptor Session.");
		}

		sessionHost.fault("protocol-fault", fault);

		expect(peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { cause: fault },
		});
		expect(acceptor.state).toMatchObject({ status: "active" });
	});

	it("RPC-STATE-002 RPC-SPI-011 contains a peer-local Protocol fault to its Session", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let firstForceCalls = 0;
		let runtimeCloseCalls = 0;
		const fault = new Error("first Session violated the invocation seam");
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor(host) {
				protocolHost = host;
				return {
					async accept() {},
					async shutdown() {},
					close() {
						runtimeCloseCalls += 1;
					},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		protocolHost?.admitSession({
			reserveInvocation() {
				throw fault;
			},
			forceClose() {
				firstForceCalls += 1;
			},
		});
		protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {},
		});
		const [faultingPeer, healthyPeer] = acceptor.peers;
		if (faultingPeer === undefined || healthyPeer === undefined) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		const descriptor = createRemoteServiceDescriptor(IFaultingService, {
			wireName: "test.faulting.v1",
			methods: { run: true },
		});

		await expect(faultingPeer.resolve(descriptor).run()).rejects.toMatchObject({
			code: "protocol",
			cause: fault,
		});

		expect(firstForceCalls).toBe(1);
		expect(runtimeCloseCalls).toBe(0);
		expect(acceptor.state).toMatchObject({ status: "active" });
		expect(acceptor.peers).toEqual([healthyPeer]);
		expect(faultingPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(healthyPeer.state).toEqual({ status: "connected" });
	});

	it("RPC-STATE-001 RPC-SPI-010 faults only the Session on duplicate or owner-illegal transitions", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown!: () => void;
		const forced = [0, 0];
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor(host) {
				protocolHost = host;
				return {
					async accept() {},
					shutdown() {
						return new Promise<void>((resolve) => {
							resolveShutdown = resolve;
						});
					},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const firstHost = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {
				forced[0] += 1;
			},
		});
		const secondHost = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {
				forced[1] += 1;
			},
		});
		if (firstHost === undefined || secondHost === undefined) {
			throw new Error("Expected two admitted Acceptor Sessions.");
		}
		const [, secondPeer] = acceptor.peers;
		if (secondPeer === undefined) {
			throw new Error("Expected the healthy sibling peer.");
		}

		firstHost.transition({ type: "recovering" });
		firstHost.transition({ type: "recovering" });

		expect(forced).toEqual([1, 0]);
		expect(acceptor.state).toMatchObject({ status: "active" });
		expect(acceptor.peers).toEqual([secondPeer]);

		const termination = acceptor.shutdown();
		expect(acceptor.state).toEqual({ status: "draining" });
		secondHost.transition({ type: "recovering" });
		expect(forced).toEqual([1, 1]);
		expect(acceptor.state).toEqual({ status: "draining" });
		expect(acceptor.peers).toEqual([]);

		resolveShutdown();
		await termination;
	});

	it("RPC-SHUTDOWN-001 gates a forced listener abort before reentrant handoff", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let acceptCalls = 0;
		let stateDuringAbort: string | undefined;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {
						acceptCalls += 1;
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const connection: IRpcConnection = {
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {},
		};
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				signal.addEventListener(
					"abort",
					() => {
						stateDuringAbort = acceptor.state.status;
						connectionSource.next(connection);
					},
					{ once: true },
				);
			},
		});

		await acceptor.close();

		expect(stateDuringAbort).toBe("closing");
		expect(acceptCalls).toBe(0);
	});

	it("RPC-TRANSPORT-011 reserves one overflow-close slot and stops a ready listener", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let acceptCalls = 0;
		let listenerSignal: AbortSignal | undefined;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					accept(connection) {
						acceptCalls += 1;
						connection.message$.subscribe();
						return new Promise<void>(() => {});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({
			protocol,
			runtimePolicy: { maxSessions: 1, maxHandshakes: 1 },
		});
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				listenerSignal = signal;
			},
		});
		const closeCalls = [0, 0, 0, 0];
		for (let index = 0; index < 4; index += 1) {
			const messageSource = new Subject<Uint8Array>();
			connectionSource.next({
				message$: messageSource.asObservable(),
				async send() {},
				async close() {
					closeCalls[index] += 1;
					messageSource.complete();
				},
			});
		}
		await Promise.resolve();

		expect(acceptCalls).toBe(3);
		expect(closeCalls).toEqual([0, 0, 0, 1]);
		expect(listenerSignal?.aborted).toBe(true);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "normal",
				reason: "resource-pressure",
			},
		});
	});

	it("RPC-START-003 RPC-TRANSPORT-011 rejects restart until the overflow close settles", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		let resolveOverflowClose!: () => void;
		const overflowClose = new Promise<void>((resolve) => {
			resolveOverflowClose = resolve;
		});
		let acceptCalls = 0;
		let restartCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor() {
				return {
					accept() {
						acceptCalls += 1;
						return new Promise<void>(() => {});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({
			protocol,
			runtimePolicy: { maxSessions: 1, maxHandshakes: 1 },
		});
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				signal.addEventListener(
					"abort",
					() => {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {},
						});
					},
					{ once: true },
				);
			},
		});
		for (let index = 0; index < 4; index += 1) {
			connectionSource.next({
				message$: new Subject<Uint8Array>().asObservable(),
				async send() {},
				close: index === 3 ? () => overflowClose : async () => {},
			});
		}
		await Promise.resolve();

		await expect(
			acceptor.listen({
				connection$: new Subject<IRpcConnection>().asObservable(),
				async listen() {
					restartCalls += 1;
				},
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(acceptCalls).toBe(3);
		expect(restartCalls).toBe(0);

		resolveOverflowClose();
		await Promise.resolve();
		await acceptor.close();
	});

	it("RPC-START-003 RPC-CLEANUP-002 rejects listener restart after cleanup failure", async () => {
		let observer:
			| {
					complete(): void;
			  }
			| undefined;
		const listenerCleanupFailure = new Error("listener cleanup failed");
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
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
		const acceptor = createRpcAcceptor({ protocol });
		await acceptor.listen({
			connection$: {
				subscribe(nextObserver: { complete(): void }) {
					observer = nextObserver;
					return {
						unsubscribe() {
							throw listenerCleanupFailure;
						},
					};
				},
			} as never,
			async listen() {},
		});
		observer?.complete();
		await Promise.resolve();
		expect(acceptor.state).toMatchObject({
			status: "active",
			listener: { status: "stopped" },
		});

		let restartCalls = 0;
		await expect(
			acceptor.listen({
				connection$: new Subject<IRpcConnection>().asObservable(),
				async listen() {
					restartCalls += 1;
				},
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(restartCalls).toBe(0);
		await expect(acceptor.close()).rejects.toBe(listenerCleanupFailure);
	});

	it("RPC-RESOURCE-006 RPC-CLEANUP-002 keeps a failed Direct Close inside the Connection cap", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSources = [
			new Subject<Uint8Array>(),
			new Subject<Uint8Array>(),
			new Subject<Uint8Array>(),
			new Subject<Uint8Array>(),
		];
		let acceptCalls = 0;
		let listenerSignal: AbortSignal | undefined;
		const closeCalls = [0, 0, 0, 0];
		const closeFailure = new Error("native close did not release the socket");
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor() {
				return {
					accept() {
						acceptCalls += 1;
						return new Promise<void>(() => {});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({
			protocol,
			runtimePolicy: { maxSessions: 1, maxHandshakes: 1 },
		});
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				listenerSignal = signal;
			},
		});
		for (let index = 0; index < 4; index += 1) {
			const messageSource = messageSources[index];
			if (messageSource === undefined) {
				throw new Error("Expected a complete Connection fixture.");
			}
			const connection: IRpcConnection = {
				message$: messageSource.asObservable(),
				async send() {},
				async close() {
					closeCalls[index] += 1;
					if (index === 0) {
						throw closeFailure;
					}
				},
			};
			if (index === 3) {
				messageSources[0]?.complete();
				await Promise.resolve();
				await Promise.resolve();
			}
			connectionSource.next(connection);
		}
		await Promise.resolve();

		expect(closeCalls[0]).toBe(1);
		expect(acceptCalls).toBe(3);
		expect(closeCalls[3]).toBe(1);
		expect(listenerSignal?.aborted).toBe(true);
	});

	it("RPC-CLEANUP-002 waits once for each handed-off Connection", async () => {
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
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor(host) {
				return {
					accept(ownedConnection) {
						ownedConnection.message$.subscribe();
						return Promise.resolve().then(() => {
							if (host.admitSession(session) === undefined) {
								throw new Error("Expected Session admission.");
							}
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {
				connectionSource.next(connection);
			},
		});
		await Promise.resolve();

		let settled = false;
		const termination = acceptor.close().finally(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(closeCalls).toBe(1);
		expect(settled).toBe(false);

		resolveClose();
		await termination;
		expect(closeCalls).toBe(1);
	});

	it("RPC-CLEANUP-002 RPC-CLEANUP-003 retains listener and startup cleanup failures in admission order", async () => {
		const listenerFailure = new Error("listener unsubscribe failed");
		const startupFailure = new Error("listener startup cleanup failed");
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
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
		const acceptor = createRpcAcceptor({ protocol });
		const startup = acceptor.listen({
			connection$: {
				subscribe() {
					return {
						unsubscribe() {
							throw listenerFailure;
						},
					};
				},
			} as never,
			listen(signal) {
				return new Promise<void>((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(startupFailure), {
						once: true,
					});
				});
			},
		});

		const termination = acceptor.close();
		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		const failure = await termination.then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(failure).toBeInstanceOf(AggregateError);
		expect((failure as AggregateError).errors).toEqual([
			listenerFailure,
			startupFailure,
		]);
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 aggregates early Connection failures with deadline timeout in admission order", async () => {
		vi.useFakeTimers();
		try {
			const connectionSource = new Subject<IRpcConnection>();
			const messageSources = [
				new Subject<Uint8Array>(),
				new Subject<Uint8Array>(),
				new Subject<Uint8Array>(),
			];
			const firstFailure = new Error("first Connection close failed");
			const secondFailure = new Error("second Connection close failed");
			let resolveLastClose!: () => void;
			const lastClose = new Promise<void>((resolve) => {
				resolveLastClose = resolve;
			});
			const protocol: IRpcProtocol = {
				createConnector() {
					throw new Error("Connector runtime is not used by this test.");
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
			const acceptor = createRpcAcceptor({
				protocol,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			await acceptor.listen({
				connection$: connectionSource.asObservable(),
				async listen() {},
			});
			const closeTasks = [
				() => Promise.reject(firstFailure),
				() => Promise.reject(secondFailure),
				() => lastClose,
			];
			for (let index = 0; index < closeTasks.length; index += 1) {
				const messageSource = messageSources[index];
				const close = closeTasks[index];
				if (messageSource === undefined || close === undefined) {
					throw new Error("Expected a complete Connection fixture.");
				}
				connectionSource.next({
					message$: messageSource.asObservable(),
					async send() {},
					close,
				});
			}
			messageSources[1]?.complete();
			messageSources[0]?.complete();
			await Promise.resolve();
			await Promise.resolve();

			const outcome = acceptor.close().then(
				() => undefined,
				(error: unknown) => error,
			);
			await vi.advanceTimersByTimeAsync(10);
			const failure = await outcome;

			expect(failure).toBeInstanceOf(AggregateError);
			const errors = (failure as AggregateError).errors;
			expect(errors.slice(0, 2)).toEqual([firstFailure, secondFailure]);
			expect(errors[2]).toMatchObject({
				message: "RPC Owner cleanup exceeded its deadline.",
			});

			resolveLastClose();
			await Promise.resolve();
		} finally {
			vi.useRealTimers();
		}
	});
});
