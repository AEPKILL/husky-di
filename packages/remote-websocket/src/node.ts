/**
 * @overview Node Remote WebSocket Adapter package entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */

export type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "@/interfaces/node-web-socket-options.interface";

export {
	createNodeWebSocketAcceptorAdapter,
	createNodeWebSocketConnectorAdapter,
} from "@/factories/node-web-socket-adapter.factory";
