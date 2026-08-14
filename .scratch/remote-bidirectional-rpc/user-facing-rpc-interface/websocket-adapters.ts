/**
 * @overview 仅供原型验证——WebSocket RPC 适配器的具体实现。
 *
 * 平台接口刻意只描述此原型实际使用的浏览器 WebSocket 与 `ws` 成员。
 * 通过构造器注入，这份一次性设计无需将 Express 或 `ws` 添加为仓库依赖，
 * 也能通过类型检查。
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import { Observable, type Subscriber } from "rxjs";

import type {
	IConnection,
	IConnectionListener,
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "./rpc-interface";

// ── 平台最小结构类型与公开 adapter factory ────────────────────────────────

export interface IWebSocketMessageLimits {
	readonly maxInboundMessages: number;
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

export interface WebSocketAcceptorAdapterOptions
	extends IWebSocketMessageLimits {
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
	extends IWebSocketMessageLimits {
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
			return new BrowserWebSocketConnection(webSocket, options);
		},
	};
}

// ── 平台兼容实现：Node / `ws` 被动端 ─────────────────────────────────────

class WebSocketConnectionListener implements IConnectionListener {
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
		private readonly _limits: IWebSocketMessageLimits,
		private readonly _accept: (connection: IConnection) => void,
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
			// 未匹配的路径可能由其他 upgrade 路由器负责。
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
					this._accept(new NodeWebSocketConnection(webSocket, this._limits));
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
		// 借入的 HTTP 服务器与已接受的 WebSocket，分别仍归应用和 RPC 拓扑所有。
	}

	private _attachLiveFailureListeners(): void {
		this._server.on("error", this._onFailure);
		this._server.on("close", this._onServerClose);
		this._webSocketServer.on("error", this._onFailure);
	}
}

class NodeWebSocketConnection implements IConnection {
	public readonly messages: Observable<Uint8Array>;
	private readonly _source: BoundedMessageSource;
	private _closeStarted = false;
	private _disposed = false;

	public constructor(
		private readonly _webSocket: INodeWebSocket,
		limits: IWebSocketMessageLimits,
	) {
		this._source = new BoundedMessageSource(
			limits,
			(error) => {
				this._webSocket.close(1009, error.message);
				this._detachInboundMessage();
			},
			() =>
				this._abort(
					new Error("The WebSocket connection was abandoned by its subscriber"),
				),
		);
		this.messages = this._source.messages;
		this._webSocket.on("message", this._onMessage);
		this._webSocket.on("close", this._onClose);
		this._webSocket.on("error", this._onError);
	}

	public async send(message: Uint8Array): Promise<void> {
		this._assertWritable();
		const stableMessage = message.slice();
		await new Promise<void>((resolve, reject) => {
			this._webSocket.send(stableMessage, { binary: true }, (error) => {
				if (error) {
					this._abort(error);
					reject(error);
				} else {
					resolve();
				}
			});
		});
	}

	public close(): Promise<void> {
		if (!this._closeStarted && !this._disposed) {
			this._closeStarted = true;
			this._webSocket.close(1000, "RPC close");
		}
		return this._source.termination;
	}

	private _abort(error: Error): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._source.abort(error);
		this._webSocket.terminate();
	}

	private readonly _onMessage: NodeMessageListener = (data, isBinary) => {
		if (!isBinary) {
			const error = new TypeError("RPC WebSocket messages must be binary");
			this._webSocket.close(1003, "Binary messages required");
			this._detachInboundMessage();
			this._source.fail(error);
			return;
		}
		this._source.push(copyMessage(data));
	};

	private readonly _onClose: NodeCloseListener = (code) => {
		this._disposed = true;
		this._detach();
		if (code === 1000) {
			this._source.complete();
		} else {
			this._source.fail(new Error(`WebSocket closed abnormally (${code})`));
		}
	};

	private readonly _onError: NodeErrorListener = (error) => {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._source.fail(error);
		this._detach();
		this._webSocket.terminate();
	};

	private _assertWritable(): void {
		if (this._disposed || this._webSocket.readyState !== 1) {
			throw new Error("The WebSocket Connection is unavailable");
		}
		if (this._closeStarted) {
			throw new Error("The WebSocket Connection is closing");
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

// ── 平台兼容实现：浏览器主动端 ────────────────────────────────────────────

class BrowserWebSocketConnection implements IConnection {
	public readonly messages: Observable<Uint8Array>;
	private readonly _source: BoundedMessageSource;
	private _closeStarted = false;
	private _disposed = false;

	public constructor(
		private readonly _webSocket: WebSocket,
		private readonly _options: BrowserWebSocketConnectorAdapterOptions,
	) {
		this._source = new BoundedMessageSource(
			_options,
			(error) => {
				this._webSocket.close(1009, error.message);
				this._detachInboundMessage();
			},
			() =>
				this._abort(
					new Error("The WebSocket connection was abandoned by its subscriber"),
				),
		);
		this.messages = this._source.messages;
		this._webSocket.addEventListener("message", this._onMessage);
		this._webSocket.addEventListener("close", this._onClose);
		this._webSocket.addEventListener("error", this._onError);
	}

	public async send(message: Uint8Array): Promise<void> {
		this._assertWritable();
		if (message.byteLength > this._options.maxOutboundBufferedBytes) {
			throw new RangeError("One RPC message exceeds the WebSocket send limit");
		}

		while (
			this._webSocket.bufferedAmount + message.byteLength >
			this._options.maxOutboundBufferedBytes
		) {
			await waitForBrowserDrainTick(this._webSocket);
			this._assertWritable();
		}

		// 浏览器的 send() 会同步消费所传入的字节。bufferedAmount 是唯一可移植的
		// 准入信号；浏览器没有提供 drain 事件。
		try {
			this._webSocket.send(message.slice().buffer);
		} catch (error) {
			const failure = toError(error);
			this._abort(failure);
			throw failure;
		}
	}

	public close(): Promise<void> {
		if (!this._closeStarted && !this._disposed) {
			this._closeStarted = true;
			this._webSocket.close(1000, "RPC close");
		}
		return this._source.termination;
	}

	private _abort(error: Error): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._detach();
		this._source.abort(error);
		// 浏览器没有 terminate()；本地 I/O 会立即失败，但 close() 仍可能发出
		// 用户代理已经排队的字节。
		this._webSocket.close();
	}

	private readonly _onMessage = (event: MessageEvent<unknown>): void => {
		if (!(event.data instanceof ArrayBuffer)) {
			const error = new TypeError("RPC WebSocket messages must be binary");
			this._webSocket.close(1003, "Binary messages required");
			this._detachInboundMessage();
			this._source.fail(error);
			return;
		}
		this._source.push(new Uint8Array(event.data.slice(0)));
	};

	private readonly _onClose = (event: CloseEvent): void => {
		this._disposed = true;
		this._detach();
		if (event.code === 1000) {
			this._source.complete();
		} else {
			this._source.fail(
				new Error(`WebSocket closed abnormally (${event.code})`),
			);
		}
	};

	private readonly _onError = (): void => {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._source.fail(new Error("The browser WebSocket transport failed"));
		this._detach();
		this._webSocket.close();
	};

	private _assertWritable(): void {
		if (this._disposed || this._webSocket.readyState !== 1) {
			throw new Error("The WebSocket Connection is unavailable");
		}
		if (this._closeStarted) {
			throw new Error("The WebSocket Connection is closing");
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

// ── 两端共享：消息源与内部工具 ────────────────────────────────────────────

class BoundedMessageSource {
	public readonly messages: Observable<Uint8Array>;
	public readonly termination: Promise<void>;
	private readonly _resolveTermination: () => void;
	private readonly _rejectTermination: (error: unknown) => void;
	private readonly _messages: Uint8Array[] = [];
	private _bufferedBytes = 0;
	private _drainScheduled = false;
	private _failure: Error | undefined;
	private _finished = false;
	private _subscribed = false;
	private _subscriber: Subscriber<Uint8Array> | undefined;

	public constructor(
		private readonly _limits: IWebSocketMessageLimits,
		private readonly _onOverflow: (error: RangeError) => void,
		private readonly _onAbandon: () => void,
	) {
		this.messages = new Observable((subscriber) => {
			if (this._subscribed) {
				queueMicrotask(() => {
					subscriber.error(
						new TypeError("Connection messages allow one subscription"),
					);
				});
				return;
			}

			this._subscribed = true;
			this._subscriber = subscriber;
			this._scheduleDrain();
			return () => {
				this._subscriber = undefined;
				if (!this._finished) {
					this._onAbandon();
				}
			};
		});

		let resolveTermination: (() => void) | undefined;
		let rejectTermination: ((error: unknown) => void) | undefined;
		this.termination = new Promise<void>((resolve, reject) => {
			resolveTermination = resolve;
			rejectTermination = reject;
		});
		// Observable 也会观察到同一个错误。当前若没有等待 termination 的 close()
		// 调用方，则应避免产生未处理的 Promise 拒绝。
		void this.termination.catch(() => undefined);
		this._resolveTermination = () => resolveTermination?.();
		this._rejectTermination = (error) => rejectTermination?.(error);
	}

	public push(message: Uint8Array): void {
		if (this._finished) {
			return;
		}
		if (
			this._messages.length >= this._limits.maxInboundMessages ||
			this._bufferedBytes + message.byteLength > this._limits.maxInboundBytes
		) {
			const error = new RangeError(
				"WebSocket RPC inbound message buffer overflow",
			);
			this.fail(error);
			this._onOverflow(error);
			return;
		}

		this._messages.push(message);
		this._bufferedBytes += message.byteLength;
		this._scheduleDrain();
	}

	public complete(): void {
		if (this._finished) {
			return;
		}
		this._finished = true;
		this._scheduleDrain();
		this._resolveTermination();
	}

	public fail(error: unknown): void {
		if (this._finished) {
			return;
		}
		this._failure = toError(error);
		this._finished = true;
		this._scheduleDrain();
		this._rejectTermination(this._failure);
	}

	public abort(error: Error): void {
		if (this._finished) {
			return;
		}
		this._messages.length = 0;
		this._bufferedBytes = 0;
		this.fail(error);
	}

	private _scheduleDrain(): void {
		if (this._drainScheduled || !this._subscriber) {
			return;
		}
		this._drainScheduled = true;
		queueMicrotask(() => this._drain());
	}

	private _drain(): void {
		this._drainScheduled = false;
		const subscriber = this._subscriber;
		if (!subscriber || subscriber.closed) {
			return;
		}

		for (let message = this._messages.shift(); message; ) {
			this._bufferedBytes -= message.byteLength;
			subscriber.next(message);
			if (subscriber.closed) {
				return;
			}
			message = this._messages.shift();
		}

		if (!this._finished) {
			return;
		}
		if (this._failure) {
			subscriber.error(this._failure);
		} else {
			subscriber.complete();
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

function copyMessage(
	data: ArrayBuffer | Uint8Array | readonly Uint8Array[],
): Uint8Array {
	if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
		const size = data.reduce((total, part) => total + part.byteLength, 0);
		const message = new Uint8Array(size);
		let offset = 0;
		for (const part of data) {
			message.set(part, offset);
			offset += part.byteLength;
		}
		return message;
	}
	return data instanceof Uint8Array
		? Uint8Array.from(data)
		: new Uint8Array(data.slice(0));
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function validateLimits(limits: IWebSocketMessageLimits): void {
	assertPositiveInteger(limits.maxInboundMessages, "maxInboundMessages");
	assertPositiveInteger(limits.maxInboundBytes, "maxInboundBytes");
}

function assertPositiveInteger(value: number, name: string): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new TypeError(`${name} must be a positive safe integer`);
	}
}
