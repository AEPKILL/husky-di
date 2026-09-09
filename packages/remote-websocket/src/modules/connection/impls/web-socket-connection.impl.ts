/**
 * @overview Bounded binary message admission and terminal cleanup for one native socket.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { Subject } from "rxjs";
import {
	getWebSocketEventError,
	toWebSocketError,
} from "@/shared/utils/web-socket-error.util";
import type {
	IWebSocketConnection,
	WebSocketConnectionFactory,
} from "../interfaces/web-socket-connection.interface";

export type CreateWebSocketConnectionOptions =
	Parameters<WebSocketConnectionFactory>[0];

export class WebSocketConnectionImpl implements IWebSocketConnection {
	readonly message$;
	private readonly _options: CreateWebSocketConnectionOptions;
	private readonly _messages = new Subject<Uint8Array>();
	private readonly _queue: InboundEntry[] = [];
	private readonly _cleanup: Promise<void>;
	private _resolveCleanup = (): void => {};
	private _active = false;
	private _stopping = false;
	private _terminal = false;
	private _nativeClosed = false;
	private _localClose = false;
	private _cleaned = false;
	private _failure: Error | undefined;
	private _closeFailure: Error | undefined;
	private _closeTask: Promise<void> | undefined;
	private _queuedBytes = 0;
	private _draining = false;
	private _reading = false;
	private _outboundMessages = 0;
	private _outboundBytes = 0;
	private _pending: PendingSend | undefined;
	private _poll: ReturnType<typeof setTimeout> | undefined;

	constructor(options: CreateWebSocketConnectionOptions) {
		this._options = options;
		this.message$ = this._messages.asObservable();
		this._cleanup = new Promise((resolve) => {
			this._resolveCleanup = resolve;
		});
		options.socket.addEventListener("message", this._onMessage);
		options.socket.addEventListener("error", this._onError);
		options.socket.addEventListener("close", this._onClose);
		options.networkStatus?.addEventListener("offline", this._onOffline);
	}
	activate(): void {
		if (this._active) return;
		this._active = true;
		this._drain();
	}
	send(message: Uint8Array): Promise<void> {
		if (this._stopping)
			return Promise.reject(
				this._failure ?? new Error("The WebSocket Connection is closed."),
			);
		let error: Error | undefined;
		if (!(message instanceof Uint8Array))
			error = new TypeError("WebSocket messages must be Uint8Array values.");
		else if (message.byteLength > this._options.limits.maxMessageBytes)
			error = new RangeError("WebSocket message exceeds maxMessageBytes.");
		else if (this._pending)
			error = new Error(
				"Concurrent unsettled WebSocket sends are not permitted.",
			);
		if (error) {
			this._fail(error);
			return Promise.reject(error);
		}
		return new Promise<void>((resolve, reject) => {
			this._pending = { message, resolve, reject };
			this._admit();
		});
	}
	close(): Promise<void> {
		if (this._closeTask) return this._closeTask;
		this._closeTask = this._cleanup.then(() => {
			if (this._closeFailure) throw this._closeFailure;
		});
		if (!this._stopping) {
			this._localClose = true;
			this._stopping = true;
			this._discardInbound();
			this._rejectSend(new Error("The WebSocket Connection was closed."));
			this._terminate();
		} else if (this._nativeClosed) {
			this._discardInbound();
			this._finish();
		}
		return this._closeTask;
	}
	private readonly _onMessage = (event: Event): void => {
		if (this._stopping) return;
		const data: unknown = Reflect.get(event, "data");
		const size =
			data instanceof Blob
				? data.size
				: data instanceof ArrayBuffer || ArrayBuffer.isView(data)
					? data.byteLength
					: undefined;
		if (size === undefined) {
			this._fail(
				new TypeError("Only binary WebSocket messages are supported."),
			);
			return;
		}
		const limits = this._options.limits;
		const overflow =
			size > limits.maxMessageBytes ||
			this._queue.length >= limits.maxQueuedMessages ||
			size > limits.maxQueuedBytes - this._queuedBytes;
		if (overflow) {
			this._fail(
				new RangeError(
					"The inbound WebSocket message queue limit was exceeded.",
				),
			);
			return;
		}
		// Inspect allocation bounds before copying or invoking asynchronous Blob conversion.
		const bytes =
			data instanceof Blob
				? data
				: data instanceof ArrayBuffer
					? new Uint8Array(data).slice()
					: new Uint8Array(
							(data as ArrayBufferView).buffer,
							(data as ArrayBufferView).byteOffset,
							size,
						).slice();
		this._queue.push({ size, data: bytes });
		this._queuedBytes += size;
		this._drain();
	};
	private readonly _onError = (event: Event): void => {
		if (!this._localClose) this._fail(getWebSocketEventError(event));
	};
	private readonly _onOffline = (): void => {
		this._fail(new Error("The browser network is offline."));
	};
	private readonly _onClose = (event: Event): void => {
		if (this._nativeClosed) return;
		this._nativeClosed = true;
		const socket = this._options.socket;
		socket.removeEventListener("message", this._onMessage);
		socket.removeEventListener("error", this._onError);
		socket.removeEventListener("close", this._onClose);
		this._options.networkStatus?.removeEventListener(
			"offline",
			this._onOffline,
		);
		const code: unknown = Reflect.get(event, "code");
		if (!this._stopping && code !== 1000 && code !== 1001) {
			this._failure = new Error(
				`WebSocket closed abnormally (code ${String(code)}).`,
			);
			this._discardInbound();
		}
		this._stopping = true;
		this._rejectSend(
			this._failure ?? new Error("The WebSocket Connection terminated."),
		);
		this._drain();
		this._finish();
	};
	private _admit(): void {
		const pending = this._pending;
		if (!pending) return;
		try {
			const socket = this._options.socket;
			if (socket.readyState !== 1)
				throw new Error("The WebSocket is not open.");
			const buffered = socket.bufferedAmount;
			if (!Number.isSafeInteger(buffered) || buffered < 0)
				throw new Error("WebSocket bufferedAmount is invalid.");
			if (buffered === 0) {
				this._outboundMessages = 0;
				this._outboundBytes = 0;
			}
			const limits = this._options.limits;
			// Counts reset only on full drain: a conservative bound without ws internals.
			const full =
				this._outboundMessages >= limits.maxQueuedMessages ||
				pending.message.byteLength >
					limits.maxQueuedBytes - this._outboundBytes ||
				buffered > limits.maxQueuedBytes - pending.message.byteLength;
			if (full) {
				this._poll = setTimeout(() => {
					this._poll = undefined;
					this._admit();
				}, 4);
				return;
			}
			// ws may retain the supplied view after send() returns; own a bounded snapshot.
			const snapshot = new Uint8Array(pending.message);
			socket.send(snapshot);
			this._outboundMessages += 1;
			this._outboundBytes += snapshot.byteLength;
			this._pending = undefined;
			pending.resolve();
		} catch (error) {
			this._fail(toWebSocketError(error, "The WebSocket send failed."));
		}
	}
	private _drain(): void {
		if (!this._active || this._draining || this._reading || this._terminal)
			return;
		this._draining = true;
		while (this._queue.length > 0) {
			const entry = this._queue[0];
			if (entry.data instanceof Blob) {
				this._reading = true;
				let conversion: Promise<ArrayBuffer>;
				try {
					conversion = entry.data.arrayBuffer();
				} catch (error) {
					this._reading = false;
					this._fail(
						toWebSocketError(error, "WebSocket Blob conversion failed."),
					);
					break;
				}
				void conversion.then(
					(buffer) => {
						if (this._queue[0] !== entry) return;
						this._reading = false;
						if (buffer.byteLength !== entry.size) {
							this._fail(
								new Error("The WebSocket Blob size changed during conversion."),
							);
							return;
						}
						entry.data = new Uint8Array(buffer);
						this._drain();
					},
					(error) => {
						if (this._queue[0] === entry) {
							this._reading = false;
							this._fail(
								toWebSocketError(error, "WebSocket Blob conversion failed."),
							);
						}
					},
				);
				break;
			}
			this._queue.shift();
			this._queuedBytes -= entry.size;
			this._messages.next(entry.data);
		}
		this._draining = false;
		this._finish();
	}
	private _fail(error: Error): void {
		if (this._terminal || this._failure || this._localClose) return;
		this._stopping = true;
		this._failure = error;
		this._discardInbound();
		this._rejectSend(error);
		this._finish();
		this._terminate();
	}
	private _terminate(): void {
		const socket = this._options.socket;
		try {
			if (socket.terminate) socket.terminate();
			else socket.close(this._failure ? 4000 : 1000);
			if (socket.readyState === 3 && !this._nativeClosed)
				this._onClose(new Event("close"));
		} catch (error) {
			this._closeFailure = toWebSocketError(
				error,
				"The WebSocket could not be closed.",
			);
			this._failure ??= this._closeFailure;
			this._onClose(new Event("close"));
		}
	}
	private _discardInbound(): void {
		this._queue.length = 0;
		this._queuedBytes = 0;
		this._reading = false;
	}
	private _finish(): void {
		const canFinish =
			this._active &&
			this._stopping &&
			this._queue.length === 0 &&
			!this._reading;
		if (!canFinish) return;
		if (!this._terminal) {
			this._terminal = true;
			if (this._failure) this._messages.error(this._failure);
			else this._messages.complete();
		}
		if (this._nativeClosed && !this._cleaned) {
			this._cleaned = true;
			this._options.onCleanup?.();
			this._resolveCleanup();
		}
	}
	private _rejectSend(error: Error): void {
		if (this._poll !== undefined) {
			clearTimeout(this._poll);
			this._poll = undefined;
		}
		const pending = this._pending;
		this._pending = undefined;
		pending?.reject(error);
	}
}

type InboundEntry = { readonly size: number; data: Uint8Array | Blob };
type PendingSend = {
	readonly message: Uint8Array;
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
};
