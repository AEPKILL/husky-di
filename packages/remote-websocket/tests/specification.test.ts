/**
 * @overview Requirement evidence for WebSocket factories and real native transport boundaries.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { IRpcConnection } from "@husky-di/remote/transport";
import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { createWebSocketConnectorAdapter } from "../src/index";
import { createWebSocketConnection } from "../src/modules/connection";
import { createSocketConnectorAdapter } from "../src/modules/connector";
import {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
} from "../src/node";
import { ControlledWebSocket } from "./test.utils";

describe("WebSocket specification", () => {
	it("WS-API-001 WS-API-002 WS-API-003 snapshots cold browser configuration and creates fresh single-use adapters", async () => {
		const instances: ControlledWebSocket[] = [];
		const observed: unknown[] = [];
		class BrowserSocket extends ControlledWebSocket {
			constructor(url: string, protocols: string[]) {
				super();
				observed.push(url, protocols);
				instances.push(this);
			}
		}
		const url = new URL("ws://localhost/rpc");
		const protocols = ["rpc-v1"];
		const options = {
			url,
			protocols,
			webSocket: BrowserSocket as unknown as typeof globalThis.WebSocket,
		};
		const adapter = createWebSocketConnectorAdapter(options);
		expect(createWebSocketConnectorAdapter(options)).not.toBe(adapter);
		const connectionTask = firstValueFrom(adapter.connection$);
		expect(instances).toHaveLength(0);
		url.pathname = "/mutated";
		protocols[0] = "mutated";
		const controller = new AbortController();
		const startup = adapter.connect(controller.signal);
		expect(observed).toEqual(["ws://localhost/rpc", ["rpc-v1"]]);
		instances[0].open();
		await startup;
		const connection = await connectionTask;
		controller.abort();
		await connection.send(new Uint8Array([1]));
		await expect(adapter.connect(controller.signal)).rejects.toThrow(
			"single-use",
		);
		await connection.close();
	});

	it.each([
		{ maxMessageBytes: 1_048_575 },
		{ maxMessageBytes: Infinity },
		{ maxQueuedMessages: 0 },
		{ maxQueuedMessages: 1.5 },
		{ maxQueuedBytes: 1 },
		{ protocols: ["same", "same"] },
		{ protocols: ["invalid token"] },
		{ url: "https://localhost" },
		{ url: "ws://localhost/#fragment" },
	])("WS-LIMIT-001 rejects invalid browser configuration %j", (options) => {
		expect(() =>
			createWebSocketConnectorAdapter({ url: "ws://localhost", ...options }),
		).toThrow();
	});

	it("WS-LIMIT-001 validates native integer coercion, listener topology, headers, and flags", () => {
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://localhost",
				maxMessageBytes: 2_147_483_648,
			}),
		).toThrow(RangeError);
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://localhost",
				handshakeTimeoutMs: 2_147_483_648,
			}),
		).toThrow(RangeError);
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://localhost",
				headers: { authorization: 42 } as unknown as Record<string, string>,
			}),
		).toThrow(TypeError);
		expect(() =>
			createNodeWebSocketConnectorAdapter({
				url: "ws://localhost",
				rejectUnauthorized: "false" as unknown as boolean,
			}),
		).toThrow(TypeError);
		expect(() => createNodeWebSocketAcceptorAdapter({})).toThrow(TypeError);
		expect(() =>
			createNodeWebSocketAcceptorAdapter({ port: 0, server: createServer() }),
		).toThrow(TypeError);
		expect(() => createNodeWebSocketAcceptorAdapter({ port: 65_536 })).toThrow(
			RangeError,
		);
		expect(() =>
			createNodeWebSocketAcceptorAdapter({ port: 0, maxConnections: 0 }),
		).toThrow(RangeError);
	});

	it("WS-CONNECT-001 gates inbound delivery through all synchronous handoff observers", async () => {
		const socket = new ControlledWebSocket();
		const adapter = createSocketConnectorAdapter({
			createSocket: () => socket,
			limits: LIMITS,
		});
		let inside = false;
		let deliveredInside = false;
		const messages: Uint8Array[] = [];
		adapter.connection$.subscribe((connection) => {
			inside = true;
			connection.message$.subscribe((message) => {
				deliveredInside ||= inside;
				messages.push(message);
			});
			socket.message(new Uint8Array([1]));
			inside = false;
		});
		adapter.connection$.subscribe(() => {
			expect(messages).toHaveLength(0);
		});
		const startup = adapter.connect(new AbortController().signal);
		socket.open();
		await startup;
		expect(deliveredInside).toBe(false);
		expect(messages).toEqual([new Uint8Array([1])]);
		socket.closeFromRemote();
	});

	it("WS-CONNECT-002 cleans cancellation before socket open and preserves native failure identity", async () => {
		const socket = new ControlledWebSocket();
		const adapter = createSocketConnectorAdapter({
			createSocket: () => socket,
			limits: LIMITS,
		});
		let completed = false;
		adapter.connection$.subscribe({
			complete: () => {
				completed = true;
			},
		});
		const controller = new AbortController();
		const startup = adapter.connect(controller.signal);
		controller.abort();
		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		await socket.waitForClose();
		expect(completed).toBe(true);
		expect(socket.closeCalls).toBe(1);
		const error = new Error("native constructor failure");
		const failing = createSocketConnectorAdapter({
			createSocket: () => {
				throw error;
			},
			limits: LIMITS,
		});
		const observed = vi.fn();
		failing.connection$.subscribe({ error: observed });
		await expect(failing.connect(new AbortController().signal)).rejects.toBe(
			error,
		);
		expect(observed).toHaveBeenCalledWith(error);
	});

	it("WS-CONNECT-003 offline status gates dialing and ends the transferred Connection", async () => {
		const network = new EventTarget();
		const remove = vi.spyOn(network, "removeEventListener");
		let online = false;
		const socket = new ControlledWebSocket();
		const createSocket = vi.fn(() => socket);
		const networkStatus = {
			get online() {
				return online;
			},
			addEventListener: (type: "offline", callback: () => void) =>
				network.addEventListener(type, callback),
			removeEventListener: (type: "offline", callback: () => void) =>
				network.removeEventListener(type, callback),
		};
		const offline = createSocketConnectorAdapter({
			createSocket,
			limits: LIMITS,
			networkStatus,
		});
		offline.connection$.subscribe({ error: () => {} });
		await expect(offline.connect(new AbortController().signal)).rejects.toThrow(
			"offline",
		);
		expect(createSocket).not.toHaveBeenCalled();
		online = true;
		const adapter = createSocketConnectorAdapter({
			createSocket,
			limits: LIMITS,
			networkStatus,
		});
		const task = firstValueFrom(adapter.connection$);
		const startup = adapter.connect(new AbortController().signal);
		socket.open();
		await startup;
		const connection = await task;
		const failed = vi.fn();
		connection.message$.subscribe({ error: failed });
		network.dispatchEvent(new Event("offline"));
		await connection.close();
		expect(failed).toHaveBeenCalledWith(
			expect.objectContaining({ message: expect.stringContaining("offline") }),
		);
		expect(remove).toHaveBeenCalled();
	});

	it("WS-MESSAGE-001 WS-MESSAGE-002 checks queue count and byte limits before Blob conversion", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({
			socket,
			limits: { ...LIMITS, maxQueuedMessages: 1 },
		});
		const failed = vi.fn();
		connection.message$.subscribe({ error: failed });
		const first = new Blob([new Uint8Array([1])]);
		const convert = vi.spyOn(first, "arrayBuffer");
		connection.activate();
		socket.message(first);
		const overflow = new Blob([new Uint8Array([2])]);
		const overflowConvert = vi.spyOn(overflow, "arrayBuffer");
		socket.message(overflow);
		await connection.close();
		expect(convert).toHaveBeenCalledOnce();
		expect(overflowConvert).not.toHaveBeenCalled();
		expect(failed).toHaveBeenCalledWith(expect.any(RangeError));
	});

	it("WS-MESSAGE-002 rejects oversized Blob before reading its allocation", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({ socket, limits: LIMITS });
		connection.message$.subscribe({ error: () => {} });
		connection.activate();
		const blob = new Blob([new Uint8Array(LIMITS.maxMessageBytes + 1)]);
		const convert = vi.spyOn(blob, "arrayBuffer");
		socket.message(blob);
		await connection.close();
		expect(convert).not.toHaveBeenCalled();
	});

	it("WS-SEND-001 WS-SEND-002 enforces pressure without copying and rejects concurrent pending sends", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		socket.bufferedAmount = LIMITS.maxQueuedBytes;
		const connection = createWebSocketConnection({ socket, limits: LIMITS });
		connection.activate();
		let failure: unknown;
		connection.message$.subscribe({
			error: (error) => {
				failure = error;
			},
		});
		const first = connection.send(new Uint8Array([1])).catch((error) => error);
		expect(socket.sent).toHaveLength(0);
		const second = connection.send(new Uint8Array([2])).catch((error) => error);
		expect(await first).toBe(await second);
		expect(await first).toBe(failure);
		await connection.close();
	});

	it("WS-ACCEPT-001 WS-ACCEPT-002 WS-CLOSE-001 WS-SEC-001 gates excess native upgrades and preserves borrowed server and peers", async () => {
		const fixture = await createNativeListener({ maxConnections: 1 });
		const clientAdapter = createNodeWebSocketConnectorAdapter({
			url: fixture.url,
		});
		const clientTask = firstValueFrom(clientAdapter.connection$);
		const acceptedTask = firstValueFrom(fixture.adapter.connection$);
		const clientStartup = clientAdapter.connect(new AbortController().signal);
		const accepted = await acceptedTask;
		await clientStartup;
		const client = await clientTask;
		accepted.message$.subscribe({ error: () => {} });
		client.message$.subscribe({ error: () => {} });
		try {
			const received = firstValueFrom(accepted.message$);
			await client.send(new Uint8Array([7, 8]));
			expect(await received).toEqual(new Uint8Array([7, 8]));
			const excess = new WebSocket(fixture.url);
			const rejection = await new Promise<Error>((resolve) =>
				excess.once("error", resolve),
			);
			expect(rejection.message).toContain("401");
			await vi.waitFor(() => expect(excess.readyState).toBe(WebSocket.CLOSED));
			expect(fixture.connections).toHaveLength(1);
			await accepted.close();
			await client.close();
			const next = new WebSocket(fixture.url);
			await once(next, "open");
			expect(fixture.connections).toHaveLength(2);
			const nextConnection = fixture.connections[1];
			fixture.controller.abort();
			expect(fixture.server.listening).toBe(true);
			const laterMessage = firstValueFrom(nextConnection.message$);
			next.send(new Uint8Array([9]));
			expect(await laterMessage).toEqual(new Uint8Array([9]));
			const nativeClose = once(next, "close");
			await nextConnection.close();
			await nativeClose;
		} finally {
			await fixture.cleanup();
		}
	});

	it.each([
		false,
		true,
	])("WS-MESSAGE-002 ws bounds fragmented and decompressed messages (compression=%s)", async (compression) => {
		const fixture = await createNativeListener({
			perMessageDeflate: compression,
		});
		const acceptedTask = firstValueFrom(fixture.adapter.connection$);
		const socket = new WebSocket(fixture.url, {
			perMessageDeflate: compression,
		});
		socket.on("error", () => {});
		await once(socket, "open");
		const connection = await acceptedTask;
		const failure = new Promise<unknown>((resolve) =>
			connection.message$.subscribe({ error: resolve }),
		);
		const closed = once(socket, "close");
		try {
			socket.send(Buffer.alloc(1_048_576), {
				fin: false,
				compress: compression,
			});
			socket.send(Buffer.from([1]), { fin: true, compress: compression });
			expect(await failure).toBeInstanceOf(Error);
			await closed;
			await connection.close();
		} finally {
			socket.terminate();
			await fixture.cleanup();
		}
	});
});

const LIMITS = {
	maxMessageBytes: 1_048_576,
	maxQueuedMessages: 16,
	maxQueuedBytes: 4_194_304,
};

async function createNativeListener(
	options: { maxConnections?: number; perMessageDeflate?: boolean } = {},
) {
	const server = createServer();
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	const address = server.address() as AddressInfo;
	const adapter = createNodeWebSocketAcceptorAdapter({
		server,
		path: "/rpc",
		...options,
	});
	const connections: IRpcConnection[] = [];
	adapter.connection$.subscribe({
		next: (connection) => {
			connections.push(connection);
			connection.message$.subscribe({ error: () => {} });
		},
		error: () => {},
	});
	const controller = new AbortController();
	await adapter.listen(controller.signal);
	return {
		server,
		adapter,
		controller,
		connections,
		url: `ws://127.0.0.1:${address.port}/rpc`,
		async cleanup() {
			controller.abort();
			await Promise.all(connections.map((connection) => connection.close()));
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		},
	};
}
