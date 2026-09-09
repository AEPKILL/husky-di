/**
 * @overview Node adapter module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export type { CreateSocketAcceptorAdapterOptions } from "./factories/node-web-socket-adapter.factory";
export {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
	createSocketAcceptorAdapter,
} from "./factories/node-web-socket-adapter.factory";
export type { INodeWebSocketListener } from "./interfaces/node-web-socket-listener.interface";
export type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "./interfaces/node-web-socket-options.interface";
