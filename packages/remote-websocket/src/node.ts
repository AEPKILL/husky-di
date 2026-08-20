/**
 * @overview Node Remote WebSocket Adapter package entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
} from "@/factories/node-web-socket-adapter.factory";
export type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "@/interfaces/node-web-socket-options.interface";
