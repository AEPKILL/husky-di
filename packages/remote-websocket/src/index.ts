/**
 * @overview Browser-safe Remote WebSocket Protocol and Adapter package entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export type { IRpcProtocol } from "@husky-di/remote";
export { createWebSocketConnectorAdapter } from "@/factories/web-socket-connector-adapter.factory";
export { createWebSocketRpcProtocol } from "@/factories/web-socket-rpc-protocol.factory";
export type {
	IWebSocketConnectorAdapterOptions,
	IWebSocketTransportLimitOptions,
} from "@/interfaces/web-socket-options.interface";
