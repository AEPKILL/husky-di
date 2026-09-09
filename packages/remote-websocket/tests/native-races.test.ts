/**
 * @overview Native buffer ownership and message-conversion shutdown regressions.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";

import { createWebSocketConnection } from "../src/modules/connection";
import { ControlledWebSocket } from "./test.utils";

describe("WebSocket native lifetime regressions", () => {
	it("WS-SEND-001 snapshots Node Buffer storage before Local Admission fulfills", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({ socket, limits });
		connection.activate();
		try {
			const payload = Buffer.from([7, 8, 9]);
			await connection.send(payload);
			payload.fill(0);
			expect(Array.from(await socket.receive())).toEqual([7, 8, 9]);
		} finally {
			await connection.close();
		}
	});

	it("WS-MESSAGE-001 WS-TERM-001 delivers complete messages before a same-turn native close", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({ socket, limits });
		const observed: (number | string)[] = [];
		connection.message$.subscribe({
			next: (message) => observed.push(message[0]),
			complete: () => observed.push("complete"),
		});
		connection.activate();
		socket.message(new Uint8Array([5]).buffer);
		socket.closeFromRemote();
		await connection.close();
		expect(observed).toEqual([5, "complete"]);
	});

	it("WS-MESSAGE-002 WS-TERM-001 errors a retained Blob conversion that rejects after native close", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({ socket, limits });
		const terminal = Promise.withResolvers<unknown>();
		connection.message$.subscribe({
			error: terminal.resolve,
			complete: () => terminal.resolve(undefined),
		});
		connection.activate();
		const conversion = Promise.withResolvers<ArrayBuffer>();
		const blob = new Blob([new Uint8Array([1])]);
		Object.defineProperty(blob, "arrayBuffer", {
			value: () => conversion.promise,
		});
		socket.message(blob);
		socket.closeFromRemote();
		const failure = new Error("Native Blob conversion failed.");
		conversion.reject(failure);
		try {
			expect(await terminal.promise).toBe(failure);
		} finally {
			await connection.close();
		}
	});

	it("WS-MESSAGE-002 WS-CLOSE-001 catches a synchronous native Blob conversion failure", async () => {
		const socket = new ControlledWebSocket();
		socket.open();
		const connection = createWebSocketConnection({ socket, limits });
		let observed: unknown;
		connection.message$.subscribe({ error: (error) => (observed = error) });
		connection.activate();
		const failure = new Error("Native Blob conversion could not start.");
		const blob = new Blob([new Uint8Array([1])]);
		Object.defineProperty(blob, "arrayBuffer", {
			value: () => {
				throw failure;
			},
		});
		socket.message(blob);
		await connection.close();
		expect(observed).toBe(failure);
	});

	it("WS-MESSAGE-001 WS-CLOSE-001 terminates browser sockets with an API-permitted close code", async () => {
		const native = new ControlledWebSocket();
		native.open();
		const socket = {
			binaryType: "arraybuffer",
			get bufferedAmount() {
				return native.bufferedAmount;
			},
			get readyState() {
				return native.readyState;
			},
			addEventListener: native.addEventListener.bind(native),
			removeEventListener: native.removeEventListener.bind(native),
			send: native.send.bind(native),
			close(code?: number) {
				if (
					code !== undefined &&
					code !== 1000 &&
					(code < 3000 || code > 4999)
				) {
					throw new DOMException(
						"Invalid browser close code.",
						"InvalidAccessError",
					);
				}
				native.close();
			},
		};
		const connection = createWebSocketConnection({ socket, limits });
		let failure: unknown;
		connection.message$.subscribe({ error: (error) => (failure = error) });
		connection.activate();
		native.message("invalid text");
		expect(native.readyState).toBeGreaterThanOrEqual(2);
		await connection.close();
		expect(failure).toBeInstanceOf(TypeError);
		expect(native.readyState).toBe(3);
	});
});

const limits = {
	maxMessageBytes: 1_048_576,
	maxQueuedMessages: 16,
	maxQueuedBytes: 4_194_304,
};
