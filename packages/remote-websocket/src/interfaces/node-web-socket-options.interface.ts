/**
 * @overview Public Node `ws` Adapter factory options.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";

import type { IWebSocketTransportLimitOptions } from "@/interfaces/web-socket-options.interface";

/** Node `ws` Connector options. */
export interface INodeWebSocketConnectorAdapterOptions
	extends IWebSocketTransportLimitOptions {
	readonly url: string | URL;
	readonly protocols?: string | readonly string[];
	readonly headers?: Readonly<Record<string, string>>;
	readonly followRedirects?: boolean;
	readonly handshakeTimeoutMs?: number;
	readonly rejectUnauthorized?: boolean;
}

/** Node `ws` Acceptor options. Exactly one of `port` or `server` is required. */
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
