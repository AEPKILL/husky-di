/**
 * @overview Single-use listener readiness, capacity admission, and independent Connection ownership.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnection,
} from "@husky-di/remote/transport";
import { Subject } from "rxjs";
import type { WebSocketConnectionFactory } from "@/modules/connection";
import type {
	IWebSocketLike,
	IWebSocketTransportLimits,
} from "@/shared/interfaces/web-socket-platform.interface";
import {
	createWebSocketAbortError,
	disposeWebSocket,
	toWebSocketError,
} from "@/shared/utils/web-socket-error.util";
import type {
	INodeWebSocketListener,
	NodeWebSocketListenerFactory,
} from "../interfaces/node-web-socket-listener.interface";

export type CreateNodeWebSocketAcceptorAdapterOptions = {
	readonly createListener: NodeWebSocketListenerFactory;
	readonly createConnection: WebSocketConnectionFactory;
	readonly limits: IWebSocketTransportLimits;
	readonly maxConnections: number;
};

export class NodeWebSocketAcceptorAdapterImpl implements IRpcAcceptorAdapter {
	readonly connection$;
	private readonly _options: CreateNodeWebSocketAcceptorAdapterOptions;
	private readonly _connections = new Subject<IRpcConnection>();
	private _used = false;
	private _stopped = false;
	private _activeConnections = 0;
	constructor(options: CreateNodeWebSocketAcceptorAdapterOptions) {
		this._options = options;
		this.connection$ = this._connections.asObservable();
	}
	listen(signal: AbortSignal): Promise<void> {
		if (this._used)
			return Promise.reject(
				new Error("A WebSocket Acceptor Adapter is single-use."),
			);
		this._used = true;
		if (signal.aborted) {
			this._stopped = true;
			this._connections.complete();
			return Promise.reject(createWebSocketAbortError());
		}
		return new Promise<void>((resolve, reject) => {
			let ready = false;
			let listener: INodeWebSocketListener | undefined;
			const cleanups: (() => void)[] = [];
			const stop = (error?: Error): void => {
				if (this._stopped) return;
				this._stopped = true;
				signal.removeEventListener("abort", abort);
				for (const cleanup of cleanups) cleanup();
				try {
					listener?.close();
				} catch {
					/* Listener terminal already owns the outcome. */
				}
				if (error) this._connections.error(error);
				else this._connections.complete();
				if (!ready) reject(error ?? createWebSocketAbortError());
			};
			const abort = (): void => {
				stop();
			};
			const onReady = (): void => {
				if (!this._stopped && !ready) {
					ready = true;
					resolve();
				}
			};
			const canAccept = (): boolean =>
				!this._stopped &&
				this._activeConnections < this._options.maxConnections;
			const accept = (socket: IWebSocketLike): void => {
				if (!canAccept()) {
					disposeWebSocket(socket);
					return;
				}
				try {
					socket.binaryType = "arraybuffer";
				} catch {
					disposeWebSocket(socket);
					return;
				}
				try {
					const connection = this._options.createConnection({
						socket,
						limits: this._options.limits,
						onCleanup: () => {
							this._activeConnections -= 1;
						},
					});
					this._activeConnections += 1;
					this._connections.next(connection);
					connection.activate();
				} catch {
					disposeWebSocket(socket);
				}
			};
			try {
				listener = this._options.createListener(canAccept);
				cleanups.push(
					listener.onError((error) => stop(error)),
					listener.onClose(() => stop()),
					listener.onConnection(accept),
					listener.onListening(onReady),
				);
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
				else if (listener.alreadyListening) queueMicrotask(onReady);
			} catch (error) {
				stop(
					toWebSocketError(
						error,
						"The WebSocket listener could not be created.",
					),
				);
			}
		});
	}
}
