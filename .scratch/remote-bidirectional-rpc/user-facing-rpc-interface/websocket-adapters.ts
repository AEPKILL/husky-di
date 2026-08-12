/**
 * @overview PROTOTYPE ONLY — concrete WebSocket RPC adapter implementations.
 *
 * The platform interfaces intentionally match only the browser WebSocket and
 * `ws` members this prototype uses. Constructor injection keeps this throwaway
 * design type-checkable without adding Express or `ws` as repository deps.
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import type {
	IPhysicalConnection,
	IPhysicalConnectionListener,
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "./public-interface";

export interface IWebSocketFrameLimits {
	readonly maxInboundFrames: number;
	readonly maxInboundBytes: number;
}

export interface IHttpUpgradeRequest {
	readonly url?: string;
}

export interface IHttpUpgradeSocket {
	destroy(error?: Error): void;
}

export interface IHttpServer {
	readonly listening: boolean;
	on(event: "upgrade", listener: HttpUpgradeListener): this;
	on(event: "listening" | "close", listener: () => void): this;
	on(event: "error", listener: (error: Error) => void): this;
	off(event: "upgrade", listener: HttpUpgradeListener): this;
	off(event: "listening" | "close", listener: () => void): this;
	off(event: "error", listener: (error: Error) => void): this;
}

export type HttpUpgradeListener = (
	request: IHttpUpgradeRequest,
	socket: IHttpUpgradeSocket,
	head: Uint8Array,
) => void;

export interface INodeWebSocket {
	readonly bufferedAmount: number;
	readonly readyState: number;
	on(event: "message", listener: NodeMessageListener): this;
	on(event: "close", listener: NodeCloseListener): this;
	on(event: "error", listener: NodeErrorListener): this;
	off(event: "message", listener: NodeMessageListener): this;
	off(event: "close", listener: NodeCloseListener): this;
	off(event: "error", listener: NodeErrorListener): this;
	send(
		data: Uint8Array,
		options: { readonly binary: true },
		callback: (error?: Error) => void,
	): void;
	close(code?: number, reason?: string): void;
	terminate(): void;
}

export interface INodeWebSocketServerOptions {
	readonly noServer: true;
	readonly clientTracking: false;
	readonly maxPayload: number;
	readonly perMessageDeflate: false;
}

export type NodeMessageListener = (
	data: ArrayBuffer | Uint8Array | readonly Uint8Array[],
	isBinary: boolean,
) => void;

export type NodeCloseListener = (code: number, reason: Uint8Array) => void;

export type NodeErrorListener = (error: Error) => void;

export interface INodeWebSocketServer {
	on(event: "error", listener: NodeErrorListener): this;
	off(event: "error", listener: NodeErrorListener): this;
	handleUpgrade(
		request: IHttpUpgradeRequest,
		socket: IHttpUpgradeSocket,
		head: Uint8Array,
		complete: (webSocket: INodeWebSocket) => void,
	): void;
	close(callback?: (error?: Error) => void): void;
}

export type CreateNodeWebSocketServer = (
	options: INodeWebSocketServerOptions,
) => INodeWebSocketServer;

export interface WebSocketAcceptorAdapterOptions extends IWebSocketFrameLimits {
	readonly server: IHttpServer;
	readonly path: `/${string}`;
	readonly maxPayloadBytes: number;
	readonly createWebSocketServer: CreateNodeWebSocketServer;
}

export function createWebSocketAcceptorAdapter(
	options: WebSocketAcceptorAdapterOptions,
): IRpcAcceptorAdapter {
	validateLimits(options);
	assertPositiveInteger(options.maxPayloadBytes, "maxPayloadBytes");
	if (options.maxInboundBytes > options.maxPayloadBytes) {
		throw new TypeError(
			"maxInboundBytes must not exceed the WebSocket maxPayloadBytes cap",
		);
	}
	if (
		!options.path.startsWith("/") ||
		options.path.startsWith("//") ||
		options.path.includes("?") ||
		options.path.includes("#")
	) {
		throw new TypeError("WebSocket RPC path must be one URL pathname");
	}

	let listening = false;
	return {
		async listen(accept, signal) {
			signal.throwIfAborted();
			if (listening) {
				throw new Error("The WebSocket RPC acceptor is already listening");
			}
			listening = true;

			let webSocketServer: INodeWebSocketServer;
			try {
				webSocketServer = options.createWebSocketServer({
					noServer: true,
					clientTracking: false,
					maxPayload: options.maxPayloadBytes,
					perMessageDeflate: false,
				});
			} catch (error) {
				listening = false;
				throw error;
			}
			const listener = new WebSocketConnectionListener(
				options.server,
				webSocketServer,
				options.path,
				options,
				accept,
				() => {
					listening = false;
				},
			);

			try {
				await listener.start(signal);
				return listener;
			} catch (error) {
				listener.dispose();
				throw error;
			}
		},
	};
}

export interface BrowserWebSocketConnectorAdapterOptions
	extends IWebSocketFrameLimits {
	readonly url: string | URL | (() => string | URL);
	readonly protocols?: string | readonly string[];
	readonly maxOutboundBufferedBytes: number;
	readonly createWebSocket?: BrowserWebSocketFactory;
}

export type BrowserWebSocketFactory = (
	url: string | URL,
	protocols?: string | readonly string[],
) => WebSocket;

export function createBrowserWebSocketConnectorAdapter(
	options: BrowserWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	validateLimits(options);
	assertPositiveInteger(
		options.maxOutboundBufferedBytes,
		"maxOutboundBufferedBytes",
	);
	const createWebSocket =
		options.createWebSocket ??
		((url: string | URL, protocols?: string | readonly string[]) =>
			new WebSocket(
				url,
				typeof protocols === "string"
					? protocols
					: protocols
						? [...protocols]
						: undefined,
			));

	return {
		async connect(signal) {
			signal.throwIfAborted();
			const url =
				typeof options.url === "function" ? options.url() : options.url;
			const webSocket = createWebSocket(url, options.protocols);
			webSocket.binaryType = "arraybuffer";
			await waitForBrowserWebSocketOpen(webSocket, signal);
			return new BrowserWebSocketPhysicalConnection(webSocket, options);
		},
	};
}

class WebSocketConnectionListener implements IPhysicalConnectionListener {
	public readonly closed: Promise<void>;
	private readonly _resolveClosed: () => void;
	private readonly _rejectClosed: (error: Error) => void;
	private _disposed = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor(
		private readonly _server: IHttpServer,
		private readonly _webSocketServer: INodeWebSocketServer,
		private readonly _path: string,
		private readonly _limits: IWebSocketFrameLimits,
		private readonly _accept: (connection: IPhysicalConnection) => void,
		private readonly _onDispose: () => void,
	) {
		let resolveClosed: (() => void) | undefined;
		let rejectClosed: ((error: Error) => void) | undefined;
		this.closed = new Promise<void>((resolve, reject) => {
			resolveClosed = resolve;
			rejectClosed = reject;
		});
		this._resolveClosed = () => resolveClosed?.();
		this._rejectClosed = (error) => rejectClosed?.(error);
	}

	public async start(signal: AbortSignal): Promise<void> {
		this._server.on("upgrade", this._onUpgrade);

		if (this._server.listening) {
			this._attachLiveFailureListeners();
			return;
		}

		await new Promise<void>((resolve, reject) => {
			const onListening = () => {
				cleanup();
				this._attachLiveFailureListeners();
				resolve();
			};
			const onError = (error: Error) => {
				cleanup();
				reject(error);
			};
			const onClose = () => {
				cleanup();
				reject(new Error("The HTTP server closed before RPC became ready"));
			};
			const onWebSocketServerError = (error: Error) => {
				cleanup();
				reject(error);
			};
			const onAbort = () => {
				cleanup();
				reject(signal.reason);
			};
			const cleanup = () => {
				this._server.off("listening", onListening);
				this._server.off("error", onError);
				this._server.off("close", onClose);
				this._webSocketServer.off("error", onWebSocketServerError);
				signal.removeEventListener("abort", onAbort);
			};

			this._server.on("listening", onListening);
			this._server.on("error", onError);
			this._server.on("close", onClose);
			this._webSocketServer.on("error", onWebSocketServerError);
			signal.addEventListener("abort", onAbort, { once: true });
			if (signal.aborted) {
				onAbort();
			}
		});
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._webSocketServer.close();
		this._onDispose();
		this._resolveClosed();
	}

	private readonly _onUpgrade: HttpUpgradeListener = (
		request,
		socket,
		head,
	) => {
		if (this._disposed) {
			return;
		}

		let pathname: string;
		try {
			pathname = new URL(request.url ?? "/", "http://rpc.invalid").pathname;
		} catch {
			socket.destroy(new TypeError("Invalid WebSocket upgrade URL"));
			return;
		}
		if (pathname !== this._path) {
			// Another upgrade router may own unmatched paths.
			return;
		}

		try {
			this._webSocketServer.handleUpgrade(
				request,
				socket,
				head,
				(webSocket) => {
					if (this._disposed) {
						webSocket.terminate();
						return;
					}
					this._accept(
						new NodeWebSocketPhysicalConnection(webSocket, this._limits),
					);
				},
			);
		} catch (error) {
			socket.destroy(toError(error));
		}
	};

	private readonly _onFailure = (error: Error): void => {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._webSocketServer.close();
		this._onDispose();
		this._rejectClosed(error);
	};

	private readonly _onServerClose = (): void => {
		this.dispose();
	};

	private _detach(): void {
		this._server.off("upgrade", this._onUpgrade);
		this._server.off("error", this._onFailure);
		this._server.off("close", this._onServerClose);
		this._webSocketServer.off("error", this._onFailure);
		// The borrowed HTTP server and already accepted WebSockets remain owned
		// by the application and RPC topology respectively.
	}

	private _attachLiveFailureListeners(): void {
		this._server.on("error", this._onFailure);
		this._server.on("close", this._onServerClose);
		this._webSocketServer.on("error", this._onFailure);
	}
}

class NodeWebSocketPhysicalConnection implements IPhysicalConnection {
	public readonly frames: AsyncIterable<Uint8Array>;
	private readonly _queue: BoundedFrameQueue;
	private _disposed = false;
	private _writeEnded = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor(
		private readonly _webSocket: INodeWebSocket,
		limits: IWebSocketFrameLimits,
	) {
		this._queue = new BoundedFrameQueue(limits, (error) => {
			this._webSocket.close(1009, error.message);
			this._detachInboundMessage();
		});
		this.frames = this._queue;
		this._webSocket.on("message", this._onMessage);
		this._webSocket.on("close", this._onClose);
		this._webSocket.on("error", this._onError);
	}

	public async send(frame: Uint8Array): Promise<void> {
		this._assertWritable();
		const stableFrame = frame.slice();
		await new Promise<void>((resolve, reject) => {
			this._webSocket.send(stableFrame, { binary: true }, (error) => {
				if (error) {
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	public async end(): Promise<void> {
		if (this._disposed) {
			throw new Error("The WebSocket Physical Connection is disposed");
		}
		if (this._writeEnded) {
			return this._queue.termination;
		}
		this._writeEnded = true;
		this._webSocket.close(1000, "RPC end");
		await this._queue.termination;
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._queue.fail(new Error("The WebSocket connection was disposed"));
		this._webSocket.terminate();
	}

	private readonly _onMessage: NodeMessageListener = (data, isBinary) => {
		if (!isBinary) {
			this._queue.fail(new TypeError("RPC WebSocket frames must be binary"));
			this._webSocket.close(1003, "Binary frames required");
			this._detachInboundMessage();
			return;
		}
		this._queue.push(copyFrame(data));
	};

	private readonly _onClose: NodeCloseListener = (code) => {
		this._disposed = true;
		this._detach();
		if (code === 1000) {
			this._queue.finish();
		} else {
			this._queue.fail(new Error(`WebSocket closed abnormally (${code})`));
		}
	};

	private readonly _onError: NodeErrorListener = (error) => {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._queue.fail(error);
		this._detach();
		this._webSocket.terminate();
	};

	private _assertWritable(): void {
		if (this._disposed || this._webSocket.readyState !== 1) {
			throw new Error("The WebSocket Physical Connection is unavailable");
		}
		if (this._writeEnded) {
			throw new Error("The WebSocket Physical Connection ended its writes");
		}
	}

	private _detach(): void {
		this._webSocket.off("message", this._onMessage);
		this._webSocket.off("close", this._onClose);
		this._webSocket.off("error", this._onError);
	}

	private _detachInboundMessage(): void {
		this._webSocket.off("message", this._onMessage);
	}
}

class BrowserWebSocketPhysicalConnection implements IPhysicalConnection {
	public readonly frames: AsyncIterable<Uint8Array>;
	private readonly _queue: BoundedFrameQueue;
	private _disposed = false;
	private _writeEnded = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	public constructor(
		private readonly _webSocket: WebSocket,
		private readonly _options: BrowserWebSocketConnectorAdapterOptions,
	) {
		this._queue = new BoundedFrameQueue(_options, (error) => {
			this._webSocket.close(1009, error.message);
			this._detachInboundMessage();
		});
		this.frames = this._queue;
		this._webSocket.addEventListener("message", this._onMessage);
		this._webSocket.addEventListener("close", this._onClose);
		this._webSocket.addEventListener("error", this._onError);
	}

	public async send(frame: Uint8Array): Promise<void> {
		this._assertWritable();
		if (frame.byteLength > this._options.maxOutboundBufferedBytes) {
			throw new RangeError("One RPC frame exceeds the WebSocket send limit");
		}

		while (
			this._webSocket.bufferedAmount + frame.byteLength >
			this._options.maxOutboundBufferedBytes
		) {
			await waitForBrowserDrainTick(this._webSocket);
			this._assertWritable();
		}

		// Browser send() consumes the passed bytes synchronously. bufferedAmount is
		// the only portable admission signal; browsers expose no drain event.
		this._webSocket.send(frame.slice().buffer);
	}

	public async end(): Promise<void> {
		if (this._disposed) {
			throw new Error("The WebSocket Physical Connection is disposed");
		}
		if (this._writeEnded) {
			return this._queue.termination;
		}
		this._writeEnded = true;
		this._webSocket.close(1000, "RPC end");
		await this._queue.termination;
	}

	public dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._queue.fail(new Error("The WebSocket connection was disposed"));
		// Browsers have no terminate(); local I/O fails immediately, while close()
		// may still transmit bytes already queued by the user agent.
		this._webSocket.close();
	}

	private readonly _onMessage = (event: MessageEvent<unknown>): void => {
		if (!(event.data instanceof ArrayBuffer)) {
			this._queue.fail(new TypeError("RPC WebSocket frames must be binary"));
			this._webSocket.close(1003, "Binary frames required");
			this._detachInboundMessage();
			return;
		}
		this._queue.push(new Uint8Array(event.data.slice(0)));
	};

	private readonly _onClose = (event: CloseEvent): void => {
		this._disposed = true;
		this._detach();
		if (event.code === 1000) {
			this._queue.finish();
		} else {
			this._queue.fail(
				new Error(`WebSocket closed abnormally (${event.code})`),
			);
		}
	};

	private readonly _onError = (): void => {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._queue.fail(new Error("The browser WebSocket transport failed"));
		this._detach();
		this._webSocket.close();
	};

	private _assertWritable(): void {
		if (this._disposed || this._webSocket.readyState !== 1) {
			throw new Error("The WebSocket Physical Connection is unavailable");
		}
		if (this._writeEnded) {
			throw new Error("The WebSocket Physical Connection ended its writes");
		}
	}

	private _detach(): void {
		this._webSocket.removeEventListener("message", this._onMessage);
		this._webSocket.removeEventListener("close", this._onClose);
		this._webSocket.removeEventListener("error", this._onError);
	}

	private _detachInboundMessage(): void {
		this._webSocket.removeEventListener("message", this._onMessage);
	}
}

class BoundedFrameQueue implements AsyncIterable<Uint8Array> {
	public readonly termination: Promise<void>;
	private readonly _resolveTermination: () => void;
	private readonly _rejectTermination: (error: unknown) => void;
	private readonly _frames: Uint8Array[] = [];
	private _bufferedBytes = 0;
	private _failure: unknown;
	private _finished = false;
	private _taken = false;
	private _wake: (() => void) | undefined;

	public constructor(
		private readonly _limits: IWebSocketFrameLimits,
		private readonly _onOverflow: (error: RangeError) => void,
	) {
		let resolveTermination: (() => void) | undefined;
		let rejectTermination: ((error: unknown) => void) | undefined;
		this.termination = new Promise<void>((resolve, reject) => {
			resolveTermination = resolve;
			rejectTermination = reject;
		});
		// Receive iteration observes the same failure. Avoid an unhandled rejection
		// when no graceful end() caller is currently awaiting termination.
		void this.termination.catch(() => undefined);
		this._resolveTermination = () => resolveTermination?.();
		this._rejectTermination = (error) => rejectTermination?.(error);
	}

	public push(frame: Uint8Array): void {
		if (this._finished) {
			return;
		}
		if (
			this._frames.length >= this._limits.maxInboundFrames ||
			this._bufferedBytes + frame.byteLength > this._limits.maxInboundBytes
		) {
			const error = new RangeError("WebSocket RPC inbound buffer overflow");
			this.fail(error);
			this._onOverflow(error);
			return;
		}

		this._frames.push(frame);
		this._bufferedBytes += frame.byteLength;
		this._wake?.();
		this._wake = undefined;
	}

	public finish(): void {
		if (this._finished) {
			return;
		}
		this._finished = true;
		this._resolveTermination();
		this._wake?.();
		this._wake = undefined;
	}

	public fail(error: unknown): void {
		if (this._finished) {
			return;
		}
		this._failure = error;
		this._finished = true;
		this._rejectTermination(error);
		this._wake?.();
		this._wake = undefined;
	}

	public [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
		if (this._taken) {
			throw new TypeError("Physical Connection frames are single-consumer");
		}
		this._taken = true;
		return this._iterate();
	}

	private async *_iterate(): AsyncGenerator<Uint8Array> {
		while (true) {
			const frame = this._frames.shift();
			if (frame) {
				this._bufferedBytes -= frame.byteLength;
				yield frame;
				continue;
			}
			if (this._failure !== undefined) {
				throw this._failure;
			}
			if (this._finished) {
				return;
			}
			await new Promise<void>((resolve) => {
				this._wake = resolve;
			});
		}
	}
}

async function waitForBrowserWebSocketOpen(
	webSocket: WebSocket,
	signal: AbortSignal,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const onOpen = () => {
			cleanup();
			resolve();
		};
		const onError = () => {
			cleanup();
			reject(new Error("The browser WebSocket connection failed"));
		};
		const onClose = (event: CloseEvent) => {
			cleanup();
			reject(new Error(`WebSocket closed before open (${event.code})`));
		};
		const onAbort = () => {
			cleanup();
			webSocket.close();
			reject(signal.reason);
		};
		const cleanup = () => {
			webSocket.removeEventListener("open", onOpen);
			webSocket.removeEventListener("error", onError);
			webSocket.removeEventListener("close", onClose);
			signal.removeEventListener("abort", onAbort);
		};

		webSocket.addEventListener("open", onOpen, { once: true });
		webSocket.addEventListener("error", onError, { once: true });
		webSocket.addEventListener("close", onClose, { once: true });
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) {
			onAbort();
		}
	});
}

async function waitForBrowserDrainTick(webSocket: WebSocket): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, 8);
		const onClose = () => {
			cleanup();
			reject(new Error("WebSocket closed while waiting for send capacity"));
		};
		const onError = () => {
			cleanup();
			reject(new Error("WebSocket failed while waiting for send capacity"));
		};
		const cleanup = () => {
			clearTimeout(timer);
			webSocket.removeEventListener("close", onClose);
			webSocket.removeEventListener("error", onError);
		};
		webSocket.addEventListener("close", onClose, { once: true });
		webSocket.addEventListener("error", onError, { once: true });
	});
}

function copyFrame(
	data: ArrayBuffer | Uint8Array | readonly Uint8Array[],
): Uint8Array {
	if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
		const size = data.reduce((total, part) => total + part.byteLength, 0);
		const frame = new Uint8Array(size);
		let offset = 0;
		for (const part of data) {
			frame.set(part, offset);
			offset += part.byteLength;
		}
		return frame;
	}
	return data instanceof Uint8Array
		? Uint8Array.from(data)
		: new Uint8Array(data.slice(0));
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function validateLimits(limits: IWebSocketFrameLimits): void {
	assertPositiveInteger(limits.maxInboundFrames, "maxInboundFrames");
	assertPositiveInteger(limits.maxInboundBytes, "maxInboundBytes");
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new TypeError(`${name} must be a positive safe integer`);
	}
}
