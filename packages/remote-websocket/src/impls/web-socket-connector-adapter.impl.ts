/**
 * @overview Browser/global WebSocket Connector Adapter implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnection, IRpcConnectorAdapter } from "@husky-di/remote";
import { type Observable, Subject } from "rxjs";

import { WebSocketConnectionImpl } from "@/impls/web-socket-connection.impl";
import type {
	IWebSocketLike,
	IWebSocketNetworkStatus,
	IWebSocketTransportLimits,
} from "@/interfaces/web-socket-platform.interface";
import {
	addAbortListener,
	createAbortError,
	getWebSocketCloseError,
	getWebSocketEventError,
	isAbortSignalAborted,
} from "@/utils/web-socket-error.util";

/** Creates a socket lazily and hands off one opened Connection. */
export class WebSocketConnectorAdapterImpl implements IRpcConnectorAdapter {
	private readonly _createSocket: () => IWebSocketLike;
	private readonly _limits: IWebSocketTransportLimits;
	private readonly _networkStatus: IWebSocketNetworkStatus | undefined;
	private readonly _connectionSubject = new Subject<IRpcConnection>();
	private _used = false;
	readonly connection$: Observable<IRpcConnection>;

	constructor(
		createSocket: () => IWebSocketLike,
		limits: IWebSocketTransportLimits,
		networkStatus?: IWebSocketNetworkStatus,
	) {
		this._createSocket = createSocket;
		this._limits = limits;
		this._networkStatus = networkStatus;
		this.connection$ = this._connectionSubject.asObservable();
	}

	connect(signal: AbortSignal): Promise<void> {
		if (this._used) {
			return Promise.reject(
				new Error("A WebSocket Connector Adapter is single-use."),
			);
		}
		this._used = true;
		try {
			if (isAbortSignalAborted(signal)) {
				const error = createAbortError();
				this._connectionSubject.complete();
				return Promise.reject(error);
			}
		} catch (error) {
			return Promise.reject(error);
		}
		if (this._networkStatus?.online === false) {
			const error = new Error("The browser network is offline.");
			this._connectionSubject.error(error);
			return Promise.reject(error);
		}

		let socket: IWebSocketLike | undefined;
		try {
			socket = this._createSocket();
			socket.binaryType = "arraybuffer";
		} catch (error) {
			const failure =
				error instanceof Error
					? error
					: new Error("The WebSocket could not be created.");
			this._connectionSubject.error(failure);
			try {
				if (socket?.terminate !== undefined) {
					socket.terminate();
				} else {
					socket?.close();
				}
			} catch {
				// Startup's original failure remains authoritative.
			}
			return Promise.reject(failure);
		}

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			let removeAbortListener = () => {};
			const cleanup = (): void => {
				socket.removeEventListener("open", handleOpen);
				socket.removeEventListener("error", handleError);
				socket.removeEventListener("close", handleClose);
				this._networkStatus?.removeEventListener("offline", handleOffline);
				removeAbortListener();
			};
			const rejectStartup = (error: Error, complete: boolean): void => {
				if (settled) {
					return;
				}
				settled = true;
				cleanup();
				if (complete) {
					this._connectionSubject.complete();
				} else {
					this._connectionSubject.error(error);
				}
				try {
					if (socket.terminate !== undefined) {
						socket.terminate();
					} else {
						socket.close();
					}
				} catch {
					// Startup's original terminal remains authoritative.
				}
				reject(error);
			};
			const handleOpen = (): void => {
				if (settled) {
					return;
				}
				settled = true;
				const connection = new WebSocketConnectionImpl(
					socket,
					this._limits,
					undefined,
					this._networkStatus,
				);
				this._connectionSubject.next(connection);
				this._connectionSubject.complete();
				cleanup();
				connection.activate();
				resolve();
			};
			const handleError = (event: Event): void => {
				rejectStartup(
					getWebSocketEventError(event, "The WebSocket connection failed."),
					false,
				);
			};
			const handleClose = (event: Event): void => {
				rejectStartup(getWebSocketCloseError(event), false);
			};
			const handleAbort = (): void => {
				rejectStartup(createAbortError(), true);
			};
			const handleOffline = (): void => {
				rejectStartup(new Error("The browser network is offline."), false);
			};

			socket.addEventListener("open", handleOpen);
			socket.addEventListener("error", handleError);
			socket.addEventListener("close", handleClose);
			this._networkStatus?.addEventListener("offline", handleOffline);
			removeAbortListener = addAbortListener(signal, handleAbort);
			if (this._networkStatus?.online === false) {
				handleOffline();
			} else if (isAbortSignalAborted(signal)) {
				handleAbort();
			}
		});
	}
}
