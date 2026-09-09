/**
 * @overview Node-only public WebSocket Connector and Acceptor entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "@/modules/node";
export {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
} from "@/modules/node";
export type { IWebSocketTransportLimitOptions } from "@/shared/interfaces/web-socket-platform.interface";
