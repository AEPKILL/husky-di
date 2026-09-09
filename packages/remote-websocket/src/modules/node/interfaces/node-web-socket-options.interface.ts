/**
 * @overview Public Node WebSocket client and listener options.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import type { IWebSocketTransportLimitOptions } from "@/shared/interfaces/web-socket-platform.interface";
export interface INodeWebSocketConnectorAdapterOptions
	extends IWebSocketTransportLimitOptions {
	readonly url: string | URL;
	readonly protocols?: string | readonly string[];
	readonly headers?: Readonly<Record<string, string>>;
	readonly followRedirects?: boolean;
	readonly handshakeTimeoutMs?: number;
	readonly rejectUnauthorized?: boolean;
}
export interface INodeWebSocketAcceptorAdapterOptions
	extends IWebSocketTransportLimitOptions {
	readonly port?: number;
	readonly server?: HttpServer | HttpsServer;
	readonly host?: string;
	readonly backlog?: number;
	readonly path?: string;
	readonly perMessageDeflate?: boolean;
	readonly maxConnections?: number;
}
