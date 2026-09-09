/**
 * @overview Single-use WebSocket startup and transfer of one opened Connection.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	IRpcConnection,
	IRpcConnectorAdapter,
} from "@husky-di/remote/transport";
import { Subject } from "rxjs";
import type {
	IWebSocketConnection,
	WebSocketConnectionFactory,
} from "@/modules/connection";
import type {
	IWebSocketLike,
	IWebSocketNetworkStatus,
	IWebSocketTransportLimits,
	WebSocketFactory,
} from "@/shared/interfaces/web-socket-platform.interface";
import {
	createWebSocketAbortError,
	disposeWebSocket,
	getWebSocketEventError,
	toWebSocketError,
} from "@/shared/utils/web-socket-error.util";

export type CreateWebSocketConnectorAdapterOptions = {
	readonly createSocket: WebSocketFactory;
	readonly createConnection: WebSocketConnectionFactory;
	readonly limits: IWebSocketTransportLimits;
	readonly networkStatus?: IWebSocketNetworkStatus;
};

export class WebSocketConnectorAdapterImpl implements IRpcConnectorAdapter {
	readonly connection$;
	private readonly _options: CreateWebSocketConnectorAdapterOptions;
	private readonly _connections = new Subject<IRpcConnection>();
	private _used = false;
	constructor(options: CreateWebSocketConnectorAdapterOptions) {
		this._options = options;
		this.connection$ = this._connections.asObservable();
	}
	connect(signal: AbortSignal): Promise<void> {
		if (this._used)
			return Promise.reject(
				new Error("A WebSocket Connector Adapter is single-use."),
			);
		this._used = true;
		if (signal.aborted) {
			this._connections.complete();
			return Promise.reject(createWebSocketAbortError());
		}
		if (this._options.networkStatus?.online === false) {
			const error = new Error("The browser network is offline.");
			this._connections.error(error);
			return Promise.reject(error);
		}
		let socket: IWebSocketLike | undefined;
		try {
			socket = this._options.createSocket();
			socket.binaryType = "arraybuffer";
		} catch (error) {
			const failure = toWebSocketError(
				error,
				"The WebSocket could not be created.",
			);
			if (socket) disposeWebSocket(socket);
			this._connections.error(failure);
			return Promise.reject(failure);
		}
		const nativeSocket = socket;
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const cleanup = (): void => {
				nativeSocket.removeEventListener("open", onOpen);
				nativeSocket.removeEventListener("close", onClose);
				nativeSocket.removeEventListener("error", onError);
				signal.removeEventListener("abort", onAbort);
				this._options.networkStatus?.removeEventListener("offline", onOffline);
			};
			const fail = (error: Error, aborted = false): void => {
				if (settled) return;
				settled = true;
				// The cleanup sink is installed before startup's native error handler is removed.
				disposeWebSocket(nativeSocket);
				cleanup();
				if (aborted) this._connections.complete();
				else this._connections.error(error);
				reject(error);
			};
			const onOpen = (): void => {
				if (settled) return;
				let connection: IWebSocketConnection;
				try {
					connection = this._options.createConnection({
						socket: nativeSocket,
						limits: this._options.limits,
						networkStatus: this._options.networkStatus,
					});
				} catch (error) {
					fail(
						toWebSocketError(
							error,
							"The WebSocket Connection could not be created.",
						),
					);
					return;
				}
				settled = true;
				cleanup();
				this._connections.next(connection);
				connection.activate();
				this._connections.complete();
				resolve();
			};
			const onError = (event: Event): void => {
				fail(getWebSocketEventError(event));
			};
			const onClose = (): void => {
				fail(new Error("The WebSocket closed before opening."));
			};
			const onAbort = (): void => {
				fail(createWebSocketAbortError(), true);
			};
			const onOffline = (): void => {
				fail(new Error("The browser network is offline."));
			};
			nativeSocket.addEventListener("open", onOpen);
			nativeSocket.addEventListener("error", onError);
			nativeSocket.addEventListener("close", onClose);
			signal.addEventListener("abort", onAbort, { once: true });
			this._options.networkStatus?.addEventListener("offline", onOffline);
			if (signal.aborted) onAbort();
			else if (this._options.networkStatus?.online === false) onOffline();
			else if (nativeSocket.readyState === 1) onOpen();
		});
	}
}
