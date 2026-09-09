/**
 * @overview Verifies connector termination.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	type RpcProtocolConnectorFactory,
} from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../src/protocol";
import { createColdProtocol } from "./connector/test.utils";

describe("Connector termination cleanup", () => {
	it("RPC-SHUTDOWN-001 RPC-CLOSE-003 interrupts an admitted startup without waiting for Protocol bind", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSource = new Subject<Uint8Array>();
		let closeCalls = 0;
		let connectorSignal: AbortSignal | undefined;
		const protocolFactory: RpcProtocolConnectorFactory = () => {
			return {
				bind(connection) {
					connection.message$.subscribe();
					return new Promise<void>(() => {});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({ protocolFactory });
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
			prepareInvocation() {
				return undefined;
			},
			forceClose() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
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
		};
		const connector = createRpcConnector({ protocolFactory });
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
		const connector = createRpcConnector({
			protocolFactory: createColdProtocol(),
		});

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
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const protocolFactory: RpcProtocolConnectorFactory = (host) => {
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
		};
		const connector = createRpcConnector({ protocolFactory });
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
});
