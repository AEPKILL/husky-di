/**
 * @overview Public WebSocket Adapter factory options.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

/** Finite Transport admission limits shared by WebSocket Adapters. */
export interface IWebSocketTransportLimitOptions {
	readonly maxMessageBytes?: number;
	readonly maxQueuedMessages?: number;
	readonly maxQueuedBytes?: number;
}

/** Browser/global WebSocket Connector options. */
export interface IWebSocketConnectorAdapterOptions
	extends IWebSocketTransportLimitOptions {
	readonly url: string | URL;
	readonly protocols?: string | readonly string[];
	readonly webSocket?: typeof WebSocket;
}
