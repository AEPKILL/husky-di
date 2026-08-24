/**
 * @overview WebSocket Adapter specification compliance tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServer } from "node:http";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcConnection,
	type IRpcProtocol,
} from "@husky-di/remote";
import {
	type IRpcProtocolSession,
	type IRpcProtocolSessionHost,
	RpcProtocolSessionTransitionTypeEnum,
} from "@husky-di/remote/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket as RawNodeWebSocket } from "ws";
import { NodeWebSocketAcceptorAdapterImpl } from "../src/impls/node-web-socket-acceptor-adapter.impl";
import { createWebSocketConnectorAdapter } from "../src/index";
import type { IWebSocketNetworkStatus } from "../src/interfaces/web-socket-platform.interface";
import {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
} from "../src/node";

afterEach(() => vi.unstubAllGlobals());

describe("Shared Adapter conformance", () => {
	it("WS-API-001 RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-003 RPC-TRANSPORT-004 RPC-TRANSPORT-005 RPC-TRANSPORT-006 RPC-TRANSPORT-007 RPC-TRANSPORT-010 RPC-RELEASE-005 passes the shared Connector and Acceptor Adapter runners", async () => {
		const {
			runRpcAcceptorAdapterConformance,
			runRpcConnectorAdapterConformance,
		} = await import("@husky-di/remote/conformance");
		const reports: Array<{ readonly status: string }> = [];
		const options = {
			report: (result: { readonly status: string }) => reports.push(result),
		};
		await runRpcConnectorAdapterConformance(
			createWebSocketConnectorConformanceFixture(),
			options,
		);
		await runRpcAcceptorAdapterConformance(
			createWebSocketAcceptorConformanceFixture(),
			options,
		);

		expect(reports).toHaveLength(24);
		expect(reports.every((result) => result.status === "passed")).toBe(true);
	});
});

describe("Connector Reconnection composition", () => {
	it("WS-API-003 returns a fresh Node Connector Adapter from every factory call", () => {
		const adapterFactory = () =>
			createNodeWebSocketConnectorAdapter({ url: "ws://example.test" });

		expect(adapterFactory()).not.toBe(adapterFactory());
	});

	it("WS-API-003 WS-CONNECT-003 keeps replacement creation and timing under the RPC Reconnection supervisor", async () => {
		vi.useFakeTimers();
		const networkStatus = new ControlledNetworkStatus(true);
		installNetworkStatus(networkStatus);
		const sockets: ControlledWebSocket[] = [];
		class TestWebSocket extends ControlledWebSocket {
			constructor() {
				super();
				sockets.push(this);
			}
		}
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		let sessionHost: IRpcProtocolSessionHost | undefined;
		const protocol: IRpcProtocol = {
			createConnector(host) {
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
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: "ws://example.test",
					webSocket: TestWebSocket as unknown as typeof WebSocket,
				}),
			policy: { retryDelaysMs: [100], attemptTimeoutMs: 1_000 },
		});

		try {
			const initial = reconnection.connect();
			expect(sockets).toHaveLength(1);
			sockets[0]?.open();
			await initial;
			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			networkStatus.setOnline(false);
			await vi.advanceTimersByTimeAsync(0);

			expect(reconnection.state).toEqual({
				status: "waiting",
				nextAttempt: 2,
				delayMs: 100,
			});
			expect(sockets).toHaveLength(1);
			networkStatus.setOnline(true);
			expect(sockets).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(99);
			expect(sockets).toHaveLength(1);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(sockets).toHaveLength(2);
			expect(sockets[1]).not.toBe(sockets[0]);
			sockets[1]?.open();
			await vi.advanceTimersByTimeAsync(0);
			expect(reconnection.state.status).toBe("monitoring");
			expect(connector.peer.state.status).toBe("connected");
		} finally {
			await reconnection.stop();
			const closeTask = connector.close();
			for (const socket of sockets) {
				if (socket.readyState !== 3) {
					socket.remoteClose(1000);
				}
			}
			await closeTask;
			vi.useRealTimers();
		}
	});
});

describe("WebSocket Connector handoff", () => {
	it("RPC-TRANSPORT-004 WS-API-001 WS-API-002 WS-CONNECT-001 is cold and transfers exactly one Connection", async () => {
		let constructionCount = 0;
		let socket: ControlledWebSocket | undefined;
		class TestWebSocket extends ControlledWebSocket {
			constructor() {
				super();
				constructionCount += 1;
				socket = this;
			}
		}
		const adapter = createWebSocketConnectorAdapter({
			url: "ws://example.test",
			webSocket: TestWebSocket as unknown as typeof WebSocket,
		});
		expect(constructionCount).toBe(0);

		const connections: IRpcConnection[] = [];
		let completed = false;
		adapter.connection$.subscribe({
			next(connection) {
				connections.push(connection);
			},
			complete() {
				completed = true;
			},
		});
		const startup = adapter.connect(new AbortController().signal);
		expect(constructionCount).toBe(1);
		socket?.open();
		await startup;

		expect(connections).toHaveLength(1);
		expect(completed).toBe(true);
		await expect(adapter.connect(new AbortController().signal)).rejects.toThrow(
			/single-use/i,
		);
	});

	it("RPC-TRANSPORT-004 WS-CONNECT-001 holds messages behind the synchronous handoff barrier", async () => {
		const harness = createControlledConnector();
		const observations: string[] = [];
		let outboundAdmission: Promise<void> | undefined;
		harness.adapter.connection$.subscribe({
			next(connection) {
				connection.message$.subscribe((message) => {
					observations.push(`message:${message[0]}`);
				});
				observations.push("handoff:start");
				outboundAdmission = connection.send(Uint8Array.of(8));
				harness.socket?.message(Uint8Array.of(7));
				observations.push("handoff:end");
			},
			complete() {
				observations.push("source:complete");
			},
		});
		const startup = harness.adapter.connect(new AbortController().signal);
		harness.socket?.open();
		await startup;
		await outboundAdmission;
		await Promise.resolve();

		expect(observations).toEqual([
			"handoff:start",
			"handoff:end",
			"source:complete",
			"message:7",
		]);
		expect(harness.socket?.sent.map((message) => [...message])).toEqual([[8]]);
	});

	it("RPC-TRANSPORT-003 WS-CONNECT-002 preserves startup Error identity and completes on abort", async () => {
		const failed = createControlledConnector();
		let sourceFailure: unknown;
		failed.adapter.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});
		const failedStartup = failed.adapter.connect(new AbortController().signal);
		const cause = new Error("dial failed");
		failed.socket?.fail(cause);
		await expect(failedStartup).rejects.toBe(cause);
		expect(sourceFailure).toBe(cause);

		const aborted = createControlledConnector();
		const controller = new AbortController();
		let completed = false;
		aborted.adapter.connection$.subscribe({
			complete() {
				completed = true;
			},
		});
		const abortedStartup = aborted.adapter.connect(controller.signal);
		controller.abort();
		await expect(abortedStartup).rejects.toMatchObject({ name: "AbortError" });
		expect(completed).toBe(true);
		expect(aborted.socket?.closeCalls).toBe(1);
	});

	it("RPC-TRANSPORT-003 WS-CONNECT-003 rejects an offline browser before socket construction", async () => {
		const networkStatus = new ControlledNetworkStatus(false);
		installNetworkStatus(networkStatus);
		const harness = createControlledConnector();
		let sourceFailure: unknown;
		harness.adapter.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});

		const failure = await harness.adapter
			.connect(new AbortController().signal)
			.then(
				() => undefined,
				(error: unknown) => error,
			);

		expect(failure).toBeInstanceOf(Error);
		expect(failure).toMatchObject({
			message: "The browser network is offline.",
		});
		expect(sourceFailure).toBe(failure);
		expect(harness.socket).toBeUndefined();
		expect(networkStatus.listenerCount("offline")).toBe(0);
	});

	it("RPC-TRANSPORT-003 WS-CONNECT-003 fails a half-open startup on offline", async () => {
		const networkStatus = new ControlledNetworkStatus(true);
		installNetworkStatus(networkStatus);
		const harness = createControlledConnector();
		let sourceFailure: unknown;
		harness.adapter.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});
		const startup = harness.adapter.connect(new AbortController().signal);

		networkStatus.setOnline(false);
		const failure = await startup.then(
			() => undefined,
			(error: unknown) => error,
		);

		expect(failure).toMatchObject({
			message: "The browser network is offline.",
		});
		expect(sourceFailure).toBe(failure);
		expect(harness.socket?.closeCalls).toBe(1);
		expect(networkStatus.listenerCount("offline")).toBe(0);
	});

	it("RPC-TRANSPORT-003 WS-CONNECT-003 terminates a transferred browser Connection on offline", async () => {
		const networkStatus = new ControlledNetworkStatus(true);
		installNetworkStatus(networkStatus);
		const { connection, socket } = await openControlledConnection();
		let connectionFailure: unknown;
		connection.message$.subscribe({
			error(error) {
				connectionFailure = error;
			},
		});

		networkStatus.setOnline(false);

		expect(connectionFailure).toMatchObject({
			message: "The browser network is offline.",
		});
		expect(socket.closeCalls).toBe(1);
		expect(networkStatus.listenerCount("offline")).toBe(0);
		networkStatus.setOnline(true);
		expect(socket.closeCalls).toBe(1);
		socket.remoteClose(1006);
	});

	it("RPC-TRANSPORT-004 WS-CONNECT-002 ignores Adapter abort after handoff", async () => {
		const harness = createControlledConnector();
		const controller = new AbortController();
		let connection: IRpcConnection | undefined;
		harness.adapter.connection$.subscribe((value) => {
			connection = value;
		});
		const startup = harness.adapter.connect(controller.signal);
		harness.socket?.open();
		await startup;
		controller.abort();
		if (connection === undefined) {
			throw new Error("Controlled Connection was not handed off.");
		}
		const transferred: IRpcConnection = connection;
		await transferred.send(Uint8Array.of(4));
		expect(harness.socket?.sent.map((message) => [...message])).toEqual([[4]]);
		expect(harness.socket?.closeCalls).toBe(0);
	});

	it("RPC-TRANSPORT-003 WS-CONNECT-002 releases a socket when binary setup fails", async () => {
		const cause = new Error("binaryType failed");
		let socket: ControlledWebSocket | undefined;
		class FailingWebSocket extends ControlledWebSocket {
			constructor() {
				super();
				this.binaryTypeError = cause;
				socket = this;
			}
		}
		const adapter = createWebSocketConnectorAdapter({
			url: "ws://example.test",
			webSocket: FailingWebSocket as unknown as typeof WebSocket,
		});
		let sourceFailure: unknown;
		adapter.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});

		await expect(adapter.connect(new AbortController().signal)).rejects.toBe(
			cause,
		);
		expect(sourceFailure).toBe(cause);
		expect(socket?.closeCalls).toBe(1);
	});
});

describe("WebSocket Connection messages", () => {
	it("RPC-TRANSPORT-001 RPC-TRANSPORT-002 WS-MESSAGE-001 preserves Blob order and notification identity", async () => {
		const harness = await openControlledConnection();
		let releaseFirst!: (value: ArrayBuffer) => void;
		const first = new ControlledBlob(
			new Promise<ArrayBuffer>((resolve) => {
				releaseFirst = resolve;
			}),
			1,
		);
		const second = new ControlledBlob(
			Promise.resolve(Uint8Array.of(2).buffer),
			1,
		);
		const firstObserver: Uint8Array[] = [];
		const secondObserver: Uint8Array[] = [];
		harness.connection.message$.subscribe((message) =>
			firstObserver.push(message),
		);
		harness.connection.message$.subscribe((message) =>
			secondObserver.push(message),
		);

		harness.socket.message(first);
		harness.socket.message(second);
		await Promise.resolve();
		expect(firstObserver).toEqual([]);
		releaseFirst(Uint8Array.of(1).buffer);
		await waitUntil(() => firstObserver.length === 2);

		expect(firstObserver.map((message) => [...message])).toEqual([[1], [2]]);
		expect(secondObserver[0]).toBe(firstObserver[0]);
		expect(secondObserver[1]).toBe(firstObserver[1]);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-010 WS-MESSAGE-001 errors the Connection on a text frame", async () => {
		const harness = await openControlledConnection();
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		harness.socket.message("not binary");

		expect(terminal).toBeInstanceOf(Error);
		expect(String((terminal as Error).message)).toMatch(/text/i);
		expect(harness.socket.closeCalls).toBe(1);
	});

	it("RPC-TRANSPORT-006 RPC-TRANSPORT-010 WS-MESSAGE-002 rejects an oversized Blob before reading it", async () => {
		const harness = await openControlledConnection();
		const blob = new ControlledBlob(
			Promise.resolve(new ArrayBuffer(0)),
			1_048_577,
		);
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		harness.socket.message(blob);

		expect(terminal).toBeInstanceOf(RangeError);
		expect(blob.arrayBufferCalls).toBe(0);
	});

	it("RPC-TRANSPORT-006 RPC-TRANSPORT-010 WS-MESSAGE-002 bounds asynchronous conversion queue count", async () => {
		const harness = await openControlledConnection({ maxQueuedMessages: 1 });
		let releaseFirst!: (value: ArrayBuffer) => void;
		const first = new ControlledBlob(
			new Promise<ArrayBuffer>((resolve) => {
				releaseFirst = resolve;
			}),
			1,
		);
		const rejected = new ControlledBlob(
			Promise.resolve(Uint8Array.of(2).buffer),
			1,
		);
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		harness.socket.message(first);
		harness.socket.message(rejected);

		expect(terminal).toBeInstanceOf(RangeError);
		expect(rejected.arrayBufferCalls).toBe(0);
		releaseFirst(Uint8Array.of(1).buffer);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-010 WS-MESSAGE-002 preserves Blob conversion Error identity", async () => {
		const harness = await openControlledConnection();
		const cause = new Error("blob read failed");
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		harness.socket.message(new ControlledBlob(Promise.reject(cause), 1));
		await waitUntil(() => terminal !== undefined);
		expect(terminal).toBe(cause);
	});

	it("RPC-TRANSPORT-006 RPC-TRANSPORT-010 WS-MESSAGE-002 bounds asynchronous conversion queue bytes", async () => {
		const harness = await openControlledConnection({
			maxQueuedBytes: 1_048_576,
		});
		let releaseFirst!: (value: ArrayBuffer) => void;
		const first = new ControlledBlob(
			new Promise<ArrayBuffer>((resolve) => {
				releaseFirst = resolve;
			}),
			600_000,
		);
		const rejected = new ControlledBlob(
			Promise.resolve(new ArrayBuffer(500_000)),
			500_000,
		);
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		harness.socket.message(first);
		harness.socket.message(rejected);

		expect(terminal).toBeInstanceOf(RangeError);
		expect(rejected.arrayBufferCalls).toBe(0);
		releaseFirst(new ArrayBuffer(600_000));
	});
});

describe("WebSocket Connection sends and terminal", () => {
	it("RPC-TRANSPORT-010 WS-SEND-001 rejects an invalid native buffered amount", async () => {
		const harness = await openControlledConnection();
		harness.socket.bufferedAmount = -1;
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});

		await expect(harness.connection.send(Uint8Array.of(1))).rejects.toBe(
			terminal,
		);
		expect(terminal).toBeInstanceOf(Error);
		expect(terminal).toMatchObject({
			message: "WebSocket bufferedAmount is invalid.",
		});
		expect(harness.socket.sent).toEqual([]);
	});

	it("RPC-TRANSPORT-005 RPC-TRANSPORT-006 WS-SEND-001 waits for bounded native capacity before Local Admission", async () => {
		const harness = await openControlledConnection();
		const message = Uint8Array.of(3, 4);
		harness.socket.bufferedAmount = 4_194_304;
		const admission = harness.connection.send(message);
		let settled = false;
		void admission.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(harness.socket.sent).toEqual([]);

		harness.socket.bufferedAmount = 0;
		await admission;
		expect(harness.socket.sent).toEqual([message]);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-006 RPC-TRANSPORT-010 WS-SEND-001 rejects oversized output before native send", async () => {
		const harness = await openControlledConnection();
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		const admission = harness.connection.send(new Uint8Array(1_048_577));
		await expect(admission).rejects.toBe(terminal);
		expect(terminal).toBeInstanceOf(RangeError);
		expect(harness.socket.sent).toEqual([]);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-005 WS-SEND-002 rejects concurrent pressure-blocked sends with one failure", async () => {
		const harness = await openControlledConnection();
		harness.socket.bufferedAmount = 4_194_304;
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		const first = harness.connection.send(Uint8Array.of(1));
		const second = harness.connection.send(Uint8Array.of(2));

		await expect(first).rejects.toBe(terminal);
		await expect(second).rejects.toBe(terminal);
		expect(terminal).toBeInstanceOf(Error);
		expect(harness.socket.sent).toEqual([]);
	});

	it("RPC-TRANSPORT-005 RPC-TRANSPORT-006 WS-SEND-001 applies message-count pressure until the native queue drains", async () => {
		const harness = await openControlledConnection({ maxQueuedMessages: 1 });
		harness.socket.bufferedAmountAfterSend = 1;
		await harness.connection.send(Uint8Array.of(1));
		const second = harness.connection.send(Uint8Array.of(2));
		let settled = false;
		void second.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		expect(harness.socket.sent).toHaveLength(1);

		harness.socket.bufferedAmountAfterSend = undefined;
		harness.socket.bufferedAmount = 0;
		await second;
		expect(harness.socket.sent.map((message) => [...message])).toEqual([
			[1],
			[2],
		]);
	});

	it("RPC-TRANSPORT-005 RPC-TRANSPORT-006 WS-SEND-001 admits exactly at the queued-byte boundary", async () => {
		const harness = await openControlledConnection({
			maxQueuedBytes: 1_048_576,
		});
		harness.socket.bufferedAmount = 1_048_575;
		await harness.connection.send(Uint8Array.of(1));
		expect(harness.socket.sent.map((message) => [...message])).toEqual([[1]]);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-006 WS-SEND-001 preserves native send failure identity", async () => {
		const harness = await openControlledConnection();
		const cause = new Error("native send failed");
		harness.socket.sendError = cause;
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		await expect(harness.connection.send(Uint8Array.of(1))).rejects.toBe(cause);
		expect(terminal).toBe(cause);
	});

	it("RPC-TRANSPORT-007 WS-CLOSE-001 gates sends synchronously and returns one terminal Promise", async () => {
		const harness = await openControlledConnection();
		let completed = false;
		harness.connection.message$.subscribe({
			complete() {
				completed = true;
			},
		});
		const first = harness.connection.close();
		const second = harness.connection.close();
		expect(second).toBe(first);
		expect(harness.socket.closeCalls).toBe(1);
		await expect(harness.connection.send(Uint8Array.of(1))).rejects.toThrow(
			/closed/i,
		);
		expect(completed).toBe(false);

		harness.socket.remoteClose(1000);
		await first;
		expect(completed).toBe(true);
	});

	it("RPC-TRANSPORT-003 WS-TERM-001 distinguishes normal and abnormal remote close", async () => {
		const normal = await openControlledConnection();
		let normalComplete = false;
		normal.connection.message$.subscribe({
			complete() {
				normalComplete = true;
			},
		});
		normal.socket.remoteClose(1001);
		expect(normalComplete).toBe(true);

		const abnormal = await openControlledConnection();
		let abnormalError: unknown;
		abnormal.connection.message$.subscribe({
			error(error) {
				abnormalError = error;
			},
		});
		abnormal.socket.remoteClose(1006);
		expect(abnormalError).toBeInstanceOf(Error);
		expect((abnormalError as Error).message).toContain("1006");
		let lateError: unknown;
		abnormal.connection.message$.subscribe({
			error(error) {
				lateError = error;
			},
		});
		expect(lateError).toBe(abnormalError);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-007 WS-CLOSE-001 preserves native close failure identity", async () => {
		const harness = await openControlledConnection();
		const cause = new Error("native close failed");
		harness.socket.closeError = cause;
		let terminal: unknown;
		harness.connection.message$.subscribe({
			error(error) {
				terminal = error;
			},
		});
		await expect(harness.connection.close()).rejects.toBe(cause);
		expect(terminal).toBe(cause);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-007 WS-CLOSE-001 waits for native terminal before rejecting an affected close", async () => {
		const harness = await openControlledConnection();
		const closing = harness.connection.close();
		const cause = new Error("socket failed while closing");
		harness.socket.fail(cause);
		let settled = false;
		void closing.catch(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);

		harness.socket.remoteClose(1006);
		await expect(closing).rejects.toBe(cause);
	});
});

describe("WebSocket policy", () => {
	it("WS-API-001 validates browser Connector factory structure", () => {
		const invalidOptions = () => createWebSocketConnectorAdapter(null as never);
		expect(invalidOptions).toThrow(TypeError);
		expect(invalidOptions).toThrow(
			"WebSocket Connector options must be an object.",
		);

		const invalidConstructor = () =>
			createWebSocketConnectorAdapter({
				url: "ws://example.test",
				webSocket: {} as never,
			});
		expect(invalidConstructor).toThrow(TypeError);
		expect(invalidConstructor).toThrow("A WebSocket constructor is required.");
	});

	it("RPC-TRANSPORT-010 WS-LIMIT-001 rejects unsafe or incompatible finite limits", () => {
		expect(() =>
			createWebSocketConnectorAdapter({
				url: "ws://example.test",
				maxMessageBytes: 1_048_575,
			}),
		).toThrow(RangeError);
		expect(() =>
			createWebSocketConnectorAdapter({
				url: "ws://example.test",
				maxQueuedMessages: 0,
			}),
		).toThrow(RangeError);
		expect(() =>
			createWebSocketConnectorAdapter({
				url: "ws://example.test",
				maxQueuedBytes: 1_048_575,
			}),
		).toThrow(RangeError);
	});

	it("RPC-TRANSPORT-012 WS-SEC-001 exposes no structural security claim", () => {
		class SecurityBoundaryWebSocket extends ControlledWebSocket {}
		const adapters = ["ws://example.test", "wss://example.test"].map((url) =>
			createWebSocketConnectorAdapter({
				url,
				webSocket: SecurityBoundaryWebSocket as unknown as typeof WebSocket,
			}),
		);
		for (const adapter of adapters) {
			for (const property of [
				"isSecure",
				"certificate",
				"channelBinding",
				"credentials",
				"capacity",
			]) {
				expect(property in adapter, property).toBe(false);
			}
		}
	});
});

describe("Node ws Adapters", () => {
	it("WS-ACCEPT-001 rejects pre-ready abort without opening the source", async () => {
		const adapter = createNodeWebSocketAcceptorAdapter({ port: 0 });
		const controller = new AbortController();
		let completed = false;
		adapter.connection$.subscribe({
			complete() {
				completed = true;
			},
		});
		const startup = adapter.listen(controller.signal);
		controller.abort();
		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		expect(completed).toBe(true);
		await expect(adapter.listen(new AbortController().signal)).rejects.toThrow(
			/single-use/i,
		);
	});

	it("RPC-TRANSPORT-003 WS-ACCEPT-001 preserves pre-ready listener Error identity", async () => {
		const occupied = createServer();
		await listenHttpServer(occupied);
		const address = occupied.address();
		if (address === null || typeof address === "string") {
			throw new Error("HTTP test server did not expose a TCP port.");
		}
		const adapter = createNodeWebSocketAcceptorAdapter({
			port: address.port,
			host: "127.0.0.1",
		});
		let sourceFailure: unknown;
		adapter.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});
		const startup = adapter.listen(new AbortController().signal);
		const rejection = await startup.catch((error: unknown) => error);
		expect(rejection).toBe(sourceFailure);
		expect(sourceFailure).toMatchObject({ code: "EADDRINUSE" });
		await closeHttpServer(occupied);
	});

	it("RPC-TRANSPORT-001 RPC-TRANSPORT-002 RPC-TRANSPORT-004 WS-API-001 WS-ACCEPT-001 exchanges binary messages over real ws", async () => {
		const server = createServer();
		await listenHttpServer(server);
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("HTTP test server did not expose a TCP port.");
		}
		const listenerController = new AbortController();
		const acceptor = createNodeWebSocketAcceptorAdapter({
			server,
			perMessageDeflate: true,
		});
		const connector = createNodeWebSocketConnectorAdapter({
			url: `ws://127.0.0.1:${address.port}`,
		});
		let accepted: IRpcConnection | undefined;
		let connected: IRpcConnection | undefined;
		acceptor.connection$.subscribe((connection) => {
			accepted = connection;
		});
		connector.connection$.subscribe((connection) => {
			connected = connection;
		});

		await acceptor.listen(listenerController.signal);
		await connector.connect(new AbortController().signal);
		if (accepted === undefined || connected === undefined) {
			throw new Error("Node Connections were not handed off.");
		}
		const acceptedConnection: IRpcConnection = accepted;
		const connectedConnection: IRpcConnection = connected;
		const serverMessages: Uint8Array[] = [];
		const clientMessages: Uint8Array[] = [];
		acceptedConnection.message$.subscribe({
			next: (message) => serverMessages.push(message),
			error() {},
		});
		connectedConnection.message$.subscribe({
			next: (message) => clientMessages.push(message),
			error() {},
		});
		await connectedConnection.send(Uint8Array.of(1, 2));
		await acceptedConnection.send(Uint8Array.of(3, 4));
		await waitUntil(
			() => serverMessages.length === 1 && clientMessages.length === 1,
		);
		expect(serverMessages.map((message) => [...message])).toEqual([[1, 2]]);
		expect(clientMessages.map((message) => [...message])).toEqual([[3, 4]]);

		listenerController.abort();
		await Promise.all([
			acceptedConnection.close(),
			connectedConnection.close(),
		]);
		await closeHttpServer(server);
	});

	it("WS-API-002 WS-ACCEPT-001 starts an owned Node ws listener lazily", async () => {
		const port = await getUnusedPort();
		const listenerController = new AbortController();
		const acceptor = createNodeWebSocketAcceptorAdapter({
			port,
			host: "127.0.0.1",
		});
		let accepted: IRpcConnection | undefined;
		acceptor.connection$.subscribe((connection) => {
			accepted = connection;
		});
		await acceptor.listen(listenerController.signal);
		const connector = createNodeWebSocketConnectorAdapter({
			url: `ws://127.0.0.1:${port}`,
		});
		let connected: IRpcConnection | undefined;
		connector.connection$.subscribe((connection) => {
			connected = connection;
		});
		await connector.connect(new AbortController().signal);
		expect(accepted).toBeDefined();
		expect(connected).toBeDefined();

		listenerController.abort();
		if (accepted !== undefined && connected !== undefined) {
			await Promise.allSettled([accepted.close(), connected.close()]);
		}
	});

	it("RPC-TRANSPORT-004 WS-ACCEPT-001 leaves a Transferred Connection alive after listener abort", async () => {
		const harness = await openNodePair();
		let sourceCompleted = false;
		harness.acceptor.connection$.subscribe({
			complete() {
				sourceCompleted = true;
			},
		});
		harness.listenerController.abort();
		expect(sourceCompleted).toBe(true);
		expect(harness.server.listening).toBe(true);

		const messages: Uint8Array[] = [];
		harness.accepted.message$.subscribe({
			next: (message) => messages.push(message),
			error() {},
		});
		await harness.connected.send(Uint8Array.of(9));
		await waitUntil(() => messages.length === 1);
		expect(messages.map((message) => [...message])).toEqual([[9]]);
		await cleanupNodePair(harness);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-004 WS-ACCEPT-001 preserves a ready listener Error and its Transferred peer", async () => {
		const harness = await openNodePair();
		const cause = new Error("external listener failed");
		let sourceFailure: unknown;
		harness.acceptor.connection$.subscribe({
			error(error) {
				sourceFailure = error;
			},
		});
		harness.server.emit("error", cause);
		expect(sourceFailure).toBe(cause);
		expect(harness.server.listening).toBe(true);

		const messages: Uint8Array[] = [];
		harness.accepted.message$.subscribe({
			next: (message) => messages.push(message),
			error() {},
		});
		await harness.connected.send(Uint8Array.of(6));
		await waitUntil(() => messages.length === 1);
		expect(messages.map((message) => [...message])).toEqual([[6]]);
		await cleanupNodePair(harness);
	});

	it("RPC-TRANSPORT-006 RPC-TRANSPORT-010 WS-MESSAGE-002 admits the compatibility floor and enforces ws maxPayload", async () => {
		const server = createServer();
		await listenHttpServer(server);
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("HTTP test server did not expose a TCP port.");
		}
		const listenerController = new AbortController();
		const acceptor = createNodeWebSocketAcceptorAdapter({
			server,
			perMessageDeflate: true,
		});
		let accepted: IRpcConnection | undefined;
		let sourceTerminal = false;
		acceptor.connection$.subscribe({
			next(connection) {
				accepted = connection;
			},
			complete() {
				sourceTerminal = true;
			},
			error() {
				sourceTerminal = true;
			},
		});
		await acceptor.listen(listenerController.signal);
		const raw = new RawNodeWebSocket(`ws://127.0.0.1:${address.port}`);
		raw.addEventListener("error", () => {});
		await waitForRawOpen(raw);
		await waitUntil(() => accepted !== undefined);
		if (accepted === undefined) {
			throw new Error("Node Connection was not handed off.");
		}
		const messages: Uint8Array[] = [];
		let connectionError: unknown;
		const acceptedConnection: IRpcConnection = accepted;
		acceptedConnection.message$.subscribe({
			next: (message) => messages.push(message),
			error(error) {
				connectionError = error;
			},
		});
		raw.send(new Uint8Array(1_048_576));
		await waitUntil(() => messages.length === 1);
		expect(messages[0]?.byteLength).toBe(1_048_576);
		raw.send(new Uint8Array(1_048_577));
		await waitUntil(() => connectionError instanceof Error);
		expect(sourceTerminal).toBe(false);

		listenerController.abort();
		raw.terminate();
		await closeHttpServer(server);
	});

	it("RPC-TRANSPORT-003 RPC-TRANSPORT-010 WS-ACCEPT-002 isolates a text-frame failure from listener and sibling", async () => {
		const server = createServer();
		await listenHttpServer(server);
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("HTTP test server did not expose a TCP port.");
		}
		const listenerController = new AbortController();
		const acceptor = createNodeWebSocketAcceptorAdapter({ server });
		const accepted: IRpcConnection[] = [];
		acceptor.connection$.subscribe((connection) => accepted.push(connection));
		await acceptor.listen(listenerController.signal);

		const first = new RawNodeWebSocket(`ws://127.0.0.1:${address.port}`);
		await waitForRawOpen(first);
		await waitUntil(() => accepted.length === 1);
		let firstError: unknown;
		accepted[0]?.message$.subscribe({
			error(error) {
				firstError = error;
			},
		});
		first.send("text");
		await waitUntil(() => firstError instanceof Error);

		const second = new RawNodeWebSocket(`ws://127.0.0.1:${address.port}`);
		await waitForRawOpen(second);
		await waitUntil(() => accepted.length === 2);
		expect(firstError).toBeInstanceOf(Error);
		expect(accepted).toHaveLength(2);

		listenerController.abort();
		first.terminate();
		second.terminate();
		await closeHttpServer(server);
	});

	it("RPC-TRANSPORT-004 RPC-TRANSPORT-007 WS-ACCEPT-002 reserves one overflow handoff and keeps the first peer", async () => {
		const server = createServer();
		await listenHttpServer(server);
		const address = server.address();
		if (address === null || typeof address === "string") {
			throw new Error("HTTP test server did not expose a TCP port.");
		}
		const acceptor = createNodeWebSocketAcceptorAdapter({
			server,
			maxConnections: 1,
		});
		const accepted: IRpcConnection[] = [];
		let completed = false;
		acceptor.connection$.subscribe({
			next: (connection) => accepted.push(connection),
			complete() {
				completed = true;
			},
		});
		await acceptor.listen(new AbortController().signal);
		const first = createNodeWebSocketConnectorAdapter({
			url: `ws://127.0.0.1:${address.port}`,
		});
		let firstConnection: IRpcConnection | undefined;
		first.connection$.subscribe((connection) => {
			firstConnection = connection;
		});
		await first.connect(new AbortController().signal);
		const second = createNodeWebSocketConnectorAdapter({
			url: `ws://127.0.0.1:${address.port}`,
		});
		let secondConnection: IRpcConnection | undefined;
		second.connection$.subscribe((connection) => {
			secondConnection = connection;
		});
		await second.connect(new AbortController().signal);
		await waitUntil(() => completed);
		expect(accepted).toHaveLength(2);

		const messages: Uint8Array[] = [];
		accepted[0]?.message$.subscribe({
			next: (message) => messages.push(message),
			error() {},
		});
		if (firstConnection === undefined) {
			throw new Error("First Node Connection was not handed off.");
		}
		const liveFirst: IRpcConnection = firstConnection;
		await liveFirst.send(Uint8Array.of(5));
		await waitUntil(() => messages.length === 1);
		expect(messages.map((message) => [...message])).toEqual([[5]]);

		await liveFirst.close();
		if (secondConnection !== undefined) {
			await secondConnection.close();
		}
		await closeHttpServer(server);
	});

	it("RPC-TRANSPORT-010 WS-LIMIT-001 validates Node listener topology and capacity", () => {
		const invalidConnectorOptions = () =>
			createNodeWebSocketConnectorAdapter(null as never);
		expect(invalidConnectorOptions).toThrow(TypeError);
		expect(invalidConnectorOptions).toThrow(
			"Node WebSocket Connector options must be an object.",
		);
		const invalidAcceptorOptions = () =>
			createNodeWebSocketAcceptorAdapter(null as never);
		expect(invalidAcceptorOptions).toThrow(TypeError);
		expect(invalidAcceptorOptions).toThrow(
			"Node WebSocket Acceptor options must be an object.",
		);
		expect(() => createNodeWebSocketAcceptorAdapter({})).toThrow(TypeError);
		expect(() =>
			createNodeWebSocketAcceptorAdapter({ port: 1, maxConnections: 0 }),
		).toThrow(RangeError);
		expect(() => createNodeWebSocketAcceptorAdapter({ port: 65_536 })).toThrow(
			RangeError,
		);
		expect(() =>
			createNodeWebSocketAcceptorAdapter({ port: 1, backlog: -1 }),
		).toThrow(RangeError);
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://example.test",
				handshakeTimeoutMs: 0,
			}),
		).toThrow(RangeError);
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://example.test",
				headers: { invalid: 1 } as unknown as Readonly<Record<string, string>>,
			}),
		).toThrow(TypeError);
	});
});

type ControlledListener = (event: Event) => void;

class ControlledNetworkStatus implements IWebSocketNetworkStatus {
	private readonly _listeners = new Map<string, Set<ControlledListener>>();
	online: boolean;

	constructor(online: boolean) {
		this.online = online;
	}

	get onLine(): boolean {
		return this.online;
	}

	addEventListener(type: string, listener: ControlledListener): void {
		const listeners = this._listeners.get(type) ?? new Set();
		listeners.add(listener);
		this._listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: ControlledListener): void {
		this._listeners.get(type)?.delete(listener);
	}

	listenerCount(type: string): number {
		return this._listeners.get(type)?.size ?? 0;
	}

	setOnline(online: boolean): void {
		this.online = online;
		const type = online ? "online" : "offline";
		const event = new Event(type);
		for (const listener of [...(this._listeners.get(type) ?? [])]) {
			listener(event);
		}
	}
}

function installNetworkStatus(networkStatus: ControlledNetworkStatus): void {
	vi.stubGlobal("navigator", networkStatus);
	vi.stubGlobal(
		"addEventListener",
		networkStatus.addEventListener.bind(networkStatus),
	);
	vi.stubGlobal(
		"removeEventListener",
		networkStatus.removeEventListener.bind(networkStatus),
	);
}

class ControlledWebSocket {
	private _binaryType = "blob";
	bufferedAmount = 0;
	readyState = 0;
	readonly listeners = new Map<string, Set<ControlledListener>>();
	readonly sent: Uint8Array[] = [];
	closeCalls = 0;
	bufferedAmountAfterSend: number | undefined;
	sendError: Error | undefined;
	closeError: Error | undefined;
	binaryTypeError: Error | undefined;

	get binaryType(): string {
		return this._binaryType;
	}

	set binaryType(value: string) {
		if (this.binaryTypeError !== undefined) {
			throw this.binaryTypeError;
		}
		this._binaryType = value;
	}

	addEventListener(type: string, listener: ControlledListener): void {
		const listeners = this.listeners.get(type) ?? new Set();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: ControlledListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	send(message: Uint8Array): void {
		if (this.sendError !== undefined) {
			throw this.sendError;
		}
		this.sent.push(message);
		if (this.bufferedAmountAfterSend !== undefined) {
			this.bufferedAmount = this.bufferedAmountAfterSend;
		}
	}

	close(): void {
		if (this.closeError !== undefined) {
			throw this.closeError;
		}
		this.closeCalls += 1;
		this.readyState = 2;
	}

	open(): void {
		this.readyState = 1;
		this.dispatch("open", new Event("open"));
	}

	message(data: unknown): void {
		this.dispatch("message", createEvent("message", { data }));
	}

	fail(error: Error): void {
		this.dispatch("error", createEvent("error", { error }));
	}

	remoteClose(code: number): void {
		this.readyState = 3;
		this.dispatch("close", createEvent("close", { code }));
	}

	dispatch(type: string, event: Event): void {
		for (const listener of [...(this.listeners.get(type) ?? [])]) {
			listener(event);
		}
	}
}

class ConformanceWebSocket extends ControlledWebSocket {
	adapterCloseRequested = false;

	override send(message: Uint8Array): void {
		super.send(message.slice());
	}

	override close(): void {
		this.adapterCloseRequested = true;
		super.close();
		queueMicrotask(() => this.remoteClose(1000));
	}

	terminate(): void {
		this.close();
	}
}

type ControlledServerListener = (...arguments_: unknown[]) => void;

class ControlledWebSocketServer {
	private readonly _listeners = new Map<
		string,
		Set<ControlledServerListener>
	>();

	on(event: string, listener: ControlledServerListener): this {
		const listeners = this._listeners.get(event) ?? new Set();
		listeners.add(listener);
		this._listeners.set(event, listeners);
		return this;
	}

	off(event: string, listener: ControlledServerListener): this {
		this._listeners.get(event)?.delete(listener);
		return this;
	}

	close(): void {}

	emit(event: string, ...arguments_: unknown[]): void {
		for (const listener of [...(this._listeners.get(event) ?? [])]) {
			listener(...arguments_);
		}
	}
}

function createWebSocketConnectorConformanceFixture() {
	return {
		async create() {
			let socket: ConformanceWebSocket | undefined;
			class TestWebSocket extends ConformanceWebSocket {
				constructor() {
					super();
					socket = this;
				}
			}
			const adapter = createWebSocketConnectorAdapter({
				url: "ws://conformance.test",
				webSocket: TestWebSocket as unknown as typeof WebSocket,
			});

			return {
				adapter,
				async handoff(firstMessage?: Uint8Array) {
					if (socket === undefined) {
						throw new Error("Connector conformance socket was not created.");
					}
					socket.open();
					const remote = createConformanceRemote(socket);
					if (firstMessage !== undefined) {
						await remote.sendToAdapter(firstMessage);
					}
					return remote;
				},
				async failStartup(error: Error) {
					if (socket === undefined) {
						throw new Error("Connector conformance socket was not created.");
					}
					socket.fail(error);
					await Promise.resolve();
				},
				async cleanup() {
					if (socket !== undefined && socket.readyState !== 3) {
						socket.remoteClose(1000);
					}
				},
			};
		},
	};
}

function createWebSocketAcceptorConformanceFixture() {
	return {
		async create() {
			const server = new ControlledWebSocketServer();
			const sockets: ConformanceWebSocket[] = [];
			const adapter = new NodeWebSocketAcceptorAdapterImpl(
				() => ({ server, alreadyListening: false }),
				{
					maxMessageBytes: 1_048_576,
					maxQueuedMessages: 16,
					maxQueuedBytes: 4_194_304,
				},
				64,
			);

			return {
				adapter,
				async accept(firstMessage?: Uint8Array) {
					const socket = new ConformanceWebSocket();
					socket.open();
					sockets.push(socket);
					server.emit("connection", socket);
					const remote = createConformanceRemote(socket);
					if (firstMessage !== undefined) {
						await remote.sendToAdapter(firstMessage);
					}
					return remote;
				},
				async markReady() {
					server.emit("listening");
				},
				async completeListener() {
					server.emit("close");
				},
				async failListener(error: Error) {
					server.emit("error", error);
				},
				async cleanup() {
					server.emit("close");
					for (const socket of sockets) {
						if (socket.readyState !== 3) {
							socket.remoteClose(1000);
						}
					}
				},
			};
		},
	};
}

function createConformanceRemote(socket: ConformanceWebSocket) {
	return {
		async sendToAdapter(message: Uint8Array) {
			socket.message(message.slice());
			await Promise.resolve();
		},
		async receiveFromAdapter() {
			await waitUntil(() => socket.sent.length > 0);
			const message = socket.sent.shift();
			if (message === undefined) {
				throw new Error("Adapter did not send a conformance message.");
			}
			return message;
		},
		async setAdapterSendBlocked(blocked: boolean) {
			socket.bufferedAmount = blocked ? 4_194_304 : 0;
		},
		async closeFromRemote() {
			socket.remoteClose(1000);
			await Promise.resolve();
		},
		async failFromRemote(error: Error) {
			socket.fail(error);
			await Promise.resolve();
		},
		isAdapterClosed: () => socket.adapterCloseRequested,
		async waitForAdapterClose() {
			await waitUntil(() => socket.adapterCloseRequested);
		},
	};
}

class ControlledBlob extends Blob {
	readonly declaredSize: number;
	readonly result: Promise<ArrayBuffer>;
	arrayBufferCalls = 0;

	constructor(result: Promise<ArrayBuffer>, declaredSize: number) {
		super();
		this.result = result;
		this.declaredSize = declaredSize;
	}

	override get size(): number {
		return this.declaredSize;
	}

	override arrayBuffer(): Promise<ArrayBuffer> {
		this.arrayBufferCalls += 1;
		return this.result;
	}
}

function createControlledConnector(
	limits: {
		readonly maxMessageBytes?: number;
		readonly maxQueuedMessages?: number;
		readonly maxQueuedBytes?: number;
	} = {},
): {
	readonly adapter: ReturnType<typeof createWebSocketConnectorAdapter>;
	readonly socket: ControlledWebSocket | undefined;
} {
	let socket: ControlledWebSocket | undefined;
	class TestWebSocket extends ControlledWebSocket {
		constructor() {
			super();
			socket = this;
		}
	}
	const adapter = createWebSocketConnectorAdapter({
		url: "ws://example.test",
		webSocket: TestWebSocket as unknown as typeof WebSocket,
		...limits,
	});
	return {
		adapter,
		get socket() {
			return socket;
		},
	};
}

async function openControlledConnection(
	limits: {
		readonly maxMessageBytes?: number;
		readonly maxQueuedMessages?: number;
		readonly maxQueuedBytes?: number;
	} = {},
): Promise<{
	readonly connection: IRpcConnection;
	readonly socket: ControlledWebSocket;
}> {
	const harness = createControlledConnector(limits);
	let connection: IRpcConnection | undefined;
	const startup = harness.adapter.connect(new AbortController().signal);
	harness.adapter.connection$.subscribe((value) => {
		connection = value;
	});
	const socket = harness.socket;
	if (socket === undefined) {
		throw new Error("Controlled WebSocket was not constructed.");
	}
	socket.open();
	await startup;
	if (connection === undefined) {
		throw new Error("Controlled Connection was not handed off.");
	}
	return { connection, socket };
}

function createEvent(
	type: string,
	properties: Readonly<Record<string, unknown>>,
): Event {
	return Object.assign(new Event(type), properties);
}

async function waitUntil(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) {
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
	}
	throw new Error("Condition was not reached.");
}

async function listenHttpServer(
	server: ReturnType<typeof createServer>,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
}

async function closeHttpServer(
	server: ReturnType<typeof createServer>,
): Promise<void> {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error === undefined) {
				resolve();
			} else {
				reject(error);
			}
		});
	});
}

async function getUnusedPort(): Promise<number> {
	const server = createServer();
	await listenHttpServer(server);
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("HTTP test server did not expose a TCP port.");
	}
	const port = address.port;
	await closeHttpServer(server);
	return port;
}

async function waitForRawOpen(socket: RawNodeWebSocket): Promise<void> {
	if (socket.readyState === 1) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		const handleOpen = (): void => {
			cleanup();
			resolve();
		};
		const handleError = (event: Event): void => {
			cleanup();
			const error = Reflect.get(event, "error");
			reject(error instanceof Error ? error : new Error("Raw ws failed."));
		};
		const cleanup = (): void => {
			socket.removeEventListener("open", handleOpen);
			socket.removeEventListener("error", handleError);
		};
		socket.addEventListener("open", handleOpen);
		socket.addEventListener("error", handleError);
	});
}

interface INodePairHarness {
	readonly server: ReturnType<typeof createServer>;
	readonly acceptor: ReturnType<typeof createNodeWebSocketAcceptorAdapter>;
	readonly listenerController: AbortController;
	readonly accepted: IRpcConnection;
	readonly connected: IRpcConnection;
}

async function openNodePair(): Promise<INodePairHarness> {
	const server = createServer();
	await listenHttpServer(server);
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("HTTP test server did not expose a TCP port.");
	}
	const listenerController = new AbortController();
	const acceptor = createNodeWebSocketAcceptorAdapter({ server });
	const connector = createNodeWebSocketConnectorAdapter({
		url: `ws://127.0.0.1:${address.port}`,
	});
	let accepted: IRpcConnection | undefined;
	let connected: IRpcConnection | undefined;
	acceptor.connection$.subscribe({
		next(connection) {
			accepted = connection;
		},
		error() {},
	});
	connector.connection$.subscribe((connection) => {
		connected = connection;
	});
	await acceptor.listen(listenerController.signal);
	await connector.connect(new AbortController().signal);
	if (accepted === undefined || connected === undefined) {
		throw new Error("Node Connections were not handed off.");
	}
	return { server, acceptor, listenerController, accepted, connected };
}

async function cleanupNodePair(harness: INodePairHarness): Promise<void> {
	harness.listenerController.abort();
	await Promise.allSettled([
		harness.accepted.close(),
		harness.connected.close(),
	]);
	await closeHttpServer(harness.server);
}
