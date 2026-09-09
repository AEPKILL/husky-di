/**
 * @overview Verifies connector startup termination.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	RpcCloseReasonEnum,
	type RpcProtocolConnectorFactory,
} from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../src/protocol";

describe("Connector termination cleanup", () => {
	it.each([
		"close",
		"shutdown",
	] as const)("RPC-CLOSE-003 RPC-SHUTDOWN-001 %s fences the attempt before abort can reenter handoff", async (method) => {
		const connectionSource = new Subject<IRpcConnection>();
		let bindCalls = 0;
		let closeCalls = 0;
		const connector = createRpcConnector({
			protocolFactory() {
				return {
					async bind() {
						bindCalls += 1;
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
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
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls[index] += 1;
			},
		}));
		let binding = 0;
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
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
		};
		const connector = createRpcConnector({ protocolFactory });
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
		const fault = new Error("fresh Session token invariant failed");
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
				sessionHost?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.closed,
					reason: RpcCloseReasonEnum.forcedClose,
				});
			},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
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
		};
		const connector = createRpcConnector({ protocolFactory });
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
			prepareInvocation: () => undefined,
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
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
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
		};
		const connector = createRpcConnector({ protocolFactory });
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
});
