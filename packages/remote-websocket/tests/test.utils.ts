/**
 * @overview Controlled native WebSocket events and bounded send-path observations.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IRpcAdapterConformanceRemote } from "@husky-di/remote/conformance";

import type { IWebSocketLike } from "../src/shared/interfaces/web-socket-platform.interface";

export class ControlledWebSocket extends EventTarget implements IWebSocketLike {
	binaryType = "blob";
	bufferedAmount = 0;
	readyState = 0;
	readonly sent: Uint8Array[] = [];
	closeCalls = 0;
	private readonly _receivers: ((message: Uint8Array) => void)[] = [];
	private readonly _closed = Promise.withResolvers<void>();

	open(): void {
		this.readyState = 1;
		this.dispatchEvent(new Event("open"));
	}

	message(data: unknown): void {
		this.dispatchEvent(new MessageEvent("message", { data }));
	}

	fail(error: Error): void {
		this.dispatchEvent(Object.assign(new Event("error"), { error }));
	}

	send(data: Uint8Array): void {
		if (this.readyState !== 1) {
			throw new Error("Controlled socket is not open.");
		}
		// Retain the native argument so the conformance runner detects borrowing
		// after Local Admission instead of having the test driver hide that bug.
		const receiver = this._receivers.shift();
		if (receiver === undefined) {
			this.sent.push(data);
		} else {
			receiver(data);
		}
	}

	close(): void {
		if (this.readyState >= 2) {
			return;
		}
		this.closeCalls += 1;
		this.readyState = 2;
		queueMicrotask(() => this.closeFromRemote());
	}

	terminate(): void {
		this.close();
	}

	closeFromRemote(code = 1000): void {
		if (this.readyState === 3) {
			return;
		}
		this.readyState = 3;
		this.dispatchEvent(
			Object.assign(new Event("close"), { code, wasClean: code === 1000 }),
		);
		this._closed.resolve();
	}

	receive(): Promise<Uint8Array> {
		const message = this.sent.shift();
		return message === undefined
			? new Promise((resolve) => this._receivers.push(resolve))
			: Promise.resolve(message);
	}

	waitForClose(): Promise<void> {
		return this._closed.promise;
	}
}

export function createControlledRemote(
	socket: ControlledWebSocket,
	maxQueuedBytes: number,
): IRpcAdapterConformanceRemote {
	return {
		async sendToAdapter(message) {
			if (socket.readyState !== 1) {
				throw new Error("Controlled socket is closed.");
			}
			socket.message(new Uint8Array(message));
		},
		receiveFromAdapter: () => socket.receive(),
		async setAdapterSendBlocked(blocked) {
			socket.bufferedAmount = blocked ? maxQueuedBytes : 0;
		},
		async closeFromRemote() {
			socket.closeFromRemote();
		},
		async failFromRemote(error) {
			socket.fail(error);
			await socket.waitForClose();
		},
		isAdapterClosed: () => socket.readyState === 3,
		waitForAdapterClose: () => socket.waitForClose(),
	};
}
