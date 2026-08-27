/**
 * @overview Browser-safe Remote WebSocket Adapter package entry point.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type-only exports precede runtime exports per repository top-level declaration order. */

export type {
	IWebSocketConnectorAdapterOptions,
	IWebSocketTransportLimitOptions,
} from "@/interfaces/web-socket-options.interface";

export { createWebSocketConnectorAdapter } from "@/factories/web-socket-connector-adapter.factory";
