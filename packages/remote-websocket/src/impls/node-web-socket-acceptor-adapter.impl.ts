/**
 * @overview Node `ws` Acceptor Adapter implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcAcceptorAdapter, IRpcConnection } from "@husky-di/remote";
import { type Observable, Subject } from "rxjs";

import { WebSocketConnectionImpl } from "@/impls/web-socket-connection.impl";
import type {
	ICreatedNodeWebSocketServer,
	INodeWebSocketServerLike,
	IWebSocketLike,
	IWebSocketTransportLimits,
} from "@/interfaces/web-socket-platform.interface";
import {
	addAbortListener,
	createAbortError,
	isAbortSignalAborted,
} from "@/utils/web-socket-error.util";

/** Owns one cold Node WebSocket listener and its Connection handoffs. */
export class NodeWebSocketAcceptorAdapterImpl implements IRpcAcceptorAdapter {
	private readonly _createServer: () => ICreatedNodeWebSocketServer;
	private readonly _limits: IWebSocketTransportLimits;
	private readonly _maxConnections: number;
	private readonly _connectionSubject = new Subject<IRpcConnection>();
	private _used = false;
	private _ready = false;
	private _stopped = false;
	private _activeConnections = 0;
	private _server: INodeWebSocketServerLike | undefined;
	private _removeAbortListener = () => {};
	private _resolveStartup: (() => void) | undefined;
	private _rejectStartup: ((error: Error) => void) | undefined;
	readonly connection$: Observable<IRpcConnection>;

	private readonly _handleListening = (): void => {
		if (this._stopped || this._ready) {
			return;
		}
		this._ready = true;
		this._resolveStartup?.();
	};

	private readonly _handleError = (...arguments_: unknown[]): void => {
		const value = arguments_[0];
		this._stopWithError(
			value instanceof Error
				? value
				: new Error("The WebSocket listener failed."),
		);
	};

	private readonly _handleClose = (): void => {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		this._removeAbortListener();
		this._removeServerListeners();
		this._connectionSubject.complete();
		if (!this._ready) {
			this._rejectStartup?.(
				new Error("The WebSocket listener closed before it was ready."),
			);
		}
	};

	private readonly _handleConnection = (...arguments_: unknown[]): void => {
		const socket = arguments_[0] as IWebSocketLike | undefined;
		if (socket === undefined) {
			return;
		}
		if (this._stopped) {
			this._closeUntransferredSocket(socket);
			return;
		}
		try {
			socket.binaryType = "arraybuffer";
		} catch {
			this._closeUntransferredSocket(socket);
			return;
		}

		if (this._activeConnections >= this._maxConnections) {
			this._handoffOverflow(socket);
			return;
		}
		this._activeConnections += 1;
		const connection = new WebSocketConnectionImpl(socket, this._limits, () => {
			this._activeConnections -= 1;
		});
		this._connectionSubject.next(connection);
		connection.activate();
	};

	constructor(
		createServer: () => ICreatedNodeWebSocketServer,
		limits: IWebSocketTransportLimits,
		maxConnections: number,
	) {
		this._createServer = createServer;
		this._limits = limits;
		this._maxConnections = maxConnections;
		this.connection$ = this._connectionSubject.asObservable();
	}

	listen(signal: AbortSignal): Promise<void> {
		if (this._used) {
			return Promise.reject(
				new Error("A WebSocket Acceptor Adapter is single-use."),
			);
		}
		this._used = true;
		try {
			if (isAbortSignalAborted(signal)) {
				const error = createAbortError();
				this._stopped = true;
				this._connectionSubject.complete();
				return Promise.reject(error);
			}
		} catch (error) {
			return Promise.reject(error);
		}

		const startup = new Promise<void>((resolve, reject) => {
			this._resolveStartup = resolve;
			this._rejectStartup = reject;
		});
		let created: ICreatedNodeWebSocketServer;
		try {
			created = this._createServer();
			this._server = created.server;
			this._server.on("listening", this._handleListening);
			this._server.on("error", this._handleError);
			this._server.on("close", this._handleClose);
			this._server.on("connection", this._handleConnection);
			this._removeAbortListener = addAbortListener(signal, () => {
				this._stopForAbort();
			});
		} catch (error) {
			const failure =
				error instanceof Error
					? error
					: new Error("The WebSocket listener could not be created.");
			this._stopWithError(failure);
			return startup;
		}
		if (isAbortSignalAborted(signal)) {
			this._stopForAbort();
		} else if (created.alreadyListening) {
			queueMicrotask(this._handleListening);
		}
		return startup;
	}

	private _handoffOverflow(socket: IWebSocketLike): void {
		this._stopped = true;
		const connection = new WebSocketConnectionImpl(socket, this._limits);
		this._connectionSubject.next(connection);
		connection.activate();
		this._connectionSubject.complete();
		this._removeAbortListener();
		this._removeServerListeners();
		this._stopNativeServer();
		if (!this._ready) {
			this._rejectStartup?.(createAbortError());
		}
		queueMicrotask(() => {
			void connection.close().catch(() => {});
		});
	}

	private _stopForAbort(): void {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		this._connectionSubject.complete();
		if (!this._ready) {
			this._rejectStartup?.(createAbortError());
		}
		this._removeAbortListener();
		this._removeServerListeners();
		this._stopNativeServer();
	}

	private _stopWithError(error: Error): void {
		if (this._stopped) {
			return;
		}
		this._stopped = true;
		this._connectionSubject.error(error);
		if (!this._ready) {
			this._rejectStartup?.(error);
		}
		this._removeAbortListener();
		this._removeServerListeners();
		this._stopNativeServer();
	}

	private _removeServerListeners(): void {
		this._server?.off("listening", this._handleListening);
		this._server?.off("error", this._handleError);
		this._server?.off("close", this._handleClose);
		this._server?.off("connection", this._handleConnection);
	}

	private _stopNativeServer(): void {
		try {
			this._server?.close();
		} catch {
			// The source terminal already owns listener settlement.
		}
	}

	private _closeUntransferredSocket(socket: IWebSocketLike): void {
		queueMicrotask(() => {
			try {
				if (socket.terminate !== undefined) {
					socket.terminate();
				} else {
					socket.close(1001);
				}
			} catch {
				// The socket was never transferred and has no observable settlement.
			}
		});
	}
}
