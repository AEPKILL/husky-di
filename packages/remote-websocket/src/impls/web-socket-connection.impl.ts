/**
 * @overview WebSocket-backed Physical RPC Connection.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnection } from "@husky-di/remote";
import { type Observable, Subject } from "rxjs";

import type {
	IWebSocketLike,
	IWebSocketNetworkStatus,
	IWebSocketTransportLimits,
} from "@/interfaces/web-socket-platform.interface";
import {
	getWebSocketCloseError,
	getWebSocketEventError,
} from "@/utils/web-socket-error.util";
import { isSafeIntegerAtLeast } from "@/utils/web-socket-policy.util";
import {
	arrayBufferMessageSchema,
	arrayBufferViewMessageSchema,
	blobMessageSchema,
	byteMessageSchema,
	textMessageSchema,
} from "@/utils/web-socket-schema.util";

interface IWebSocketInboundEntry {
	readonly size: number;
	readonly convert: () => Promise<Uint8Array>;
}

interface IWebSocketPendingSend {
	readonly message: Uint8Array;
	readonly promise: Promise<void>;
	readonly resolve: () => void;
	readonly reject: (error: Error) => void;
}

/** Adapts one native WebSocket to the remote Physical Connection seam. */
export class WebSocketConnectionImpl implements IRpcConnection {
	private readonly _socket: IWebSocketLike;
	private readonly _limits: IWebSocketTransportLimits;
	private readonly _networkStatus: IWebSocketNetworkStatus | undefined;
	private readonly _messageSubject = new Subject<Uint8Array>();
	private readonly _onTerminal: () => void;
	private readonly _inboundQueue: IWebSocketInboundEntry[] = [];
	private _state: "inactive" | "active" | "closing" | "terminated" = "inactive";
	private _inboundQueuedBytes = 0;
	private _drainingInbound = false;
	private _outboundQueuedMessages = 0;
	private _pendingSend: IWebSocketPendingSend | undefined;
	private _sendTimer: ReturnType<typeof setTimeout> | undefined;
	private _closeTask: Promise<void> | undefined;
	private readonly _nativeCleanupTask: Promise<void>;
	private _resolveNativeCleanup = () => {};
	private _nativeTerminated = false;
	private _closeFailure: Error | undefined;
	readonly message$: Observable<Uint8Array>;

	private readonly _handleMessage = (event: Event): void => {
		this._enqueueInbound(Reflect.get(event, "data"));
	};

	private readonly _handleError = (event: Event): void => {
		this._failAndTerminate(
			getWebSocketEventError(event, "The WebSocket Transport failed."),
		);
	};

	private readonly _handleClose = (event: Event): void => {
		if (this._state === "terminated") {
			this._completeNativeCleanup();
			return;
		}
		const code = Reflect.get(event, "code");
		// Local shutdown and the standard normal close codes are clean terminals.
		const closedNormally =
			this._state === "closing" || code === 1000 || code === 1001;
		if (closedNormally) {
			this._finish(undefined, true);
			return;
		}
		this._finish(getWebSocketCloseError(event), true);
	};

	private readonly _handleOffline = (): void => {
		this._failAndTerminate(new Error("The browser network is offline."));
	};

	constructor(
		socket: IWebSocketLike,
		limits: IWebSocketTransportLimits,
		onTerminal: () => void = () => {},
		networkStatus?: IWebSocketNetworkStatus,
	) {
		this._socket = socket;
		this._limits = limits;
		this._onTerminal = onTerminal;
		this._networkStatus = networkStatus;
		this.message$ = this._messageSubject.asObservable();
		this._nativeCleanupTask = new Promise<void>((resolve) => {
			this._resolveNativeCleanup = resolve;
		});
		socket.addEventListener("message", this._handleMessage);
		socket.addEventListener("error", this._handleError);
		socket.addEventListener("close", this._handleClose);
		networkStatus?.addEventListener("offline", this._handleOffline);
	}

	activate(): void {
		if (this._state !== "inactive") {
			return;
		}
		this._state = "active";
		this._drainInbound();
	}

	send(message: Uint8Array): Promise<void> {
		if (!byteMessageSchema.safeParse(message).success) {
			const error = new TypeError(
				"WebSocket messages must be Uint8Array values.",
			);
			this._failAndTerminate(error);
			return Promise.reject(error);
		}
		if (message.byteLength > this._limits.maxMessageBytes) {
			const error = new RangeError(
				`WebSocket message exceeds maxMessageBytes (${this._limits.maxMessageBytes}).`,
			);
			this._failAndTerminate(error);
			return Promise.reject(error);
		}
		if (this._state !== "active" && this._state !== "inactive") {
			return Promise.reject(new Error("The WebSocket Connection is closed."));
		}
		if (this._pendingSend !== undefined) {
			const error = new Error(
				"Concurrent unsettled WebSocket sends are not permitted.",
			);
			this._failAndTerminate(error);
			return Promise.reject(error);
		}

		return this._admitOrWait(message);
	}

	close(): Promise<void> {
		if (this._closeTask !== undefined) {
			return this._closeTask;
		}
		if (this._state === "terminated") {
			this._closeTask = this._nativeCleanupTask;
			return this._closeTask;
		}

		this._closeTask = this._nativeCleanupTask.then(() => {
			if (this._closeFailure !== undefined) {
				throw this._closeFailure;
			}
		});
		this._state = "closing";
		this._rejectPendingSend(new Error("The WebSocket Connection was closed."));
		try {
			if (this._socket.terminate !== undefined) {
				this._socket.terminate();
			} else {
				this._socket.close(1000);
			}
		} catch (error) {
			const failure =
				error instanceof Error
					? error
					: new Error("The WebSocket could not be closed.");
			this._closeFailure = failure;
			this._finish(failure, true);
		}
		return this._closeTask;
	}

	private _admitOrWait(message: Uint8Array): Promise<void> {
		let bufferedAmount: number;
		try {
			bufferedAmount = this._readBufferedAmount();
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			this._failAndTerminate(failure);
			return Promise.reject(failure);
		}
		if (bufferedAmount === 0) {
			this._outboundQueuedMessages = 0;
		}
		// Immediate send admission requires both message-count and byte capacity.
		const canSendImmediately =
			this._outboundQueuedMessages < this._limits.maxQueuedMessages &&
			bufferedAmount + message.byteLength <= this._limits.maxQueuedBytes;
		if (canSendImmediately) {
			try {
				this._socket.send(message);
				this._outboundQueuedMessages =
					this._readBufferedAmount() === 0
						? 0
						: this._outboundQueuedMessages + 1;
				return Promise.resolve();
			} catch (error) {
				const failure =
					error instanceof Error
						? error
						: new Error("The WebSocket send failed.");
				this._failAndTerminate(failure);
				return Promise.reject(failure);
			}
		}

		let resolve!: () => void;
		let reject!: (error: Error) => void;
		const promise = new Promise<void>((resolvePromise, rejectPromise) => {
			resolve = resolvePromise;
			reject = rejectPromise;
		});
		this._pendingSend = { message, promise, resolve, reject };
		this._scheduleSendPoll();
		return promise;
	}

	private _scheduleSendPoll(): void {
		if (this._sendTimer !== undefined || this._pendingSend === undefined) {
			return;
		}
		this._sendTimer = setTimeout(() => {
			this._sendTimer = undefined;
			const pending = this._pendingSend;
			if (pending === undefined || this._state !== "active") {
				return;
			}
			this._pendingSend = undefined;
			const admission = this._admitOrWait(pending.message);
			void admission.then(pending.resolve, pending.reject);
		}, 4);
	}

	private _readBufferedAmount(): number {
		const value = this._socket.bufferedAmount;
		if (!isSafeIntegerAtLeast(value, 0)) {
			throw new Error("WebSocket bufferedAmount is invalid.");
		}
		return value;
	}

	private _enqueueInbound(data: unknown): void {
		if (this._state === "closing" || this._state === "terminated") {
			return;
		}
		let entry: IWebSocketInboundEntry;
		if (textMessageSchema.safeParse(data).success) {
			this._failAndTerminate(
				new Error(
					"Text WebSocket frames are not valid RPC Transport messages.",
				),
			);
			return;
		}
		if (blobMessageSchema.safeParse(data).success) {
			const blob = data as Blob;
			entry = {
				size: blob.size,
				convert: async () => new Uint8Array(await blob.arrayBuffer()),
			};
		} else if (arrayBufferMessageSchema.safeParse(data).success) {
			const arrayBuffer = data as ArrayBuffer;
			entry = {
				size: arrayBuffer.byteLength,
				convert: async () => new Uint8Array(arrayBuffer),
			};
		} else if (arrayBufferViewMessageSchema.safeParse(data).success) {
			const view = data as ArrayBufferView;
			const bytes = byteMessageSchema.safeParse(view).success
				? (view as Uint8Array)
				: new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
			entry = { size: bytes.byteLength, convert: async () => bytes };
		} else {
			this._failAndTerminate(
				new Error("The WebSocket delivered an unsupported binary payload."),
			);
			return;
		}

		// Every inbound entry must fit both the per-message and aggregate queue limits.
		const exceedsInboundLimits =
			entry.size > this._limits.maxMessageBytes ||
			this._inboundQueue.length >= this._limits.maxQueuedMessages ||
			this._inboundQueuedBytes + entry.size > this._limits.maxQueuedBytes;
		if (exceedsInboundLimits) {
			this._failAndTerminate(
				new RangeError(
					"The inbound WebSocket message queue limit was exceeded.",
				),
			);
			return;
		}
		this._inboundQueue.push(entry);
		this._inboundQueuedBytes += entry.size;
		this._drainInbound();
	}

	private _drainInbound(): void {
		// A drain starts only for an active, idle consumer with queued work.
		const cannotStartInboundDrain =
			this._state !== "active" ||
			this._drainingInbound ||
			this._inboundQueue.length === 0;
		if (cannotStartInboundDrain) {
			return;
		}
		this._drainingInbound = true;
		void this._runInboundDrain();
	}

	private async _runInboundDrain(): Promise<void> {
		while (this._state === "active") {
			const entry = this._inboundQueue[0];
			if (entry === undefined) {
				break;
			}
			let bytes: Uint8Array;
			try {
				bytes = await entry.convert();
			} catch (error) {
				this._failAndTerminate(
					error instanceof Error
						? error
						: new Error("The WebSocket binary payload could not be read."),
				);
				break;
			}
			if (this._state !== "active") {
				break;
			}
			if (bytes.byteLength !== entry.size) {
				this._failAndTerminate(
					new Error("The WebSocket binary payload size changed while reading."),
				);
				break;
			}
			this._inboundQueue.shift();
			this._inboundQueuedBytes -= entry.size;
			this._messageSubject.next(bytes);
		}
		this._drainingInbound = false;
		if (this._state === "active" && this._inboundQueue.length > 0) {
			this._drainInbound();
		}
	}

	private _failAndTerminate(error: Error): void {
		if (this._state === "terminated") {
			return;
		}
		this._finish(error);
		try {
			if (this._socket.terminate !== undefined) {
				this._socket.terminate();
			} else {
				this._socket.close(1002);
			}
		} catch {
			// The original Transport failure remains authoritative.
			this._completeNativeCleanup();
		}
	}

	private _finish(error?: Error, nativeTerminated = false): void {
		if (this._state === "terminated") {
			if (nativeTerminated) {
				this._completeNativeCleanup();
			}
			return;
		}
		const closeWasPending = this._state === "closing";
		this._state = "terminated";
		this._socket.removeEventListener("message", this._handleMessage);
		this._socket.removeEventListener("error", this._handleError);
		this._networkStatus?.removeEventListener("offline", this._handleOffline);
		this._inboundQueue.length = 0;
		this._inboundQueuedBytes = 0;
		this._rejectPendingSend(
			error ?? new Error("The WebSocket Connection terminated."),
		);
		if (error === undefined) {
			this._messageSubject.complete();
		} else {
			if (closeWasPending) {
				this._closeFailure = error;
			}
			this._messageSubject.error(error);
		}
		if (nativeTerminated) {
			this._completeNativeCleanup();
		}
	}

	private _completeNativeCleanup(): void {
		if (this._nativeTerminated) {
			return;
		}
		this._nativeTerminated = true;
		this._socket.removeEventListener("message", this._handleMessage);
		this._socket.removeEventListener("error", this._handleError);
		this._socket.removeEventListener("close", this._handleClose);
		this._networkStatus?.removeEventListener("offline", this._handleOffline);
		this._resolveNativeCleanup();
		this._onTerminal();
	}

	private _rejectPendingSend(error: Error): void {
		if (this._sendTimer !== undefined) {
			clearTimeout(this._sendTimer);
			this._sendTimer = undefined;
		}
		const pending = this._pendingSend;
		this._pendingSend = undefined;
		pending?.reject(error);
	}
}
