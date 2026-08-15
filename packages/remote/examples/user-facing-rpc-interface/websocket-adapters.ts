/**
 * @overview Simulated public Interface of the independent @husky-di/remote-websocket package.
 *
 * The prototype intentionally declares only the package seam. WebSocket framing,
 * buffering, platform events, and Node/browser glue do not belong in remote core.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { Server } from "node:http";
import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@husky-di/remote";

export type BrowserWebSocketConnectorOptions = Readonly<{
	url: string | URL | (() => string | URL);
	protocols?: string | readonly string[];
	maxInboundMessages: number;
	maxInboundBytes: number;
	maxOutboundBufferedBytes: number;
}>;

export declare function createBrowserWebSocketConnectorAdapter(
	options: BrowserWebSocketConnectorOptions,
): IRpcConnectorAdapter;

export type NodeWebSocketAcceptorOptions = Readonly<{
	/** Borrowed; disposing the Adapter never closes the application's HTTP server. */
	server: Server;
	path: `/${string}`;
	maxPayloadBytes: number;
	maxInboundMessages: number;
	maxInboundBytes: number;
}>;

export declare function createNodeWebSocketAcceptorAdapter(
	options: NodeWebSocketAcceptorOptions,
): IRpcAcceptorAdapter;
