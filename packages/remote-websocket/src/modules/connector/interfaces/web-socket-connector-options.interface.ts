/**
 * @overview Public browser WebSocket Connector options.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IWebSocketTransportLimitOptions } from "@/shared/interfaces/web-socket-platform.interface";
export interface IWebSocketConnectorAdapterOptions
	extends IWebSocketTransportLimitOptions {
	readonly url: string | URL;
	readonly protocols?: string | readonly string[];
	readonly webSocket?: typeof WebSocket;
}
