/**
 * @overview Connector module boundary for browser and Node assembly.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export type { CreateSocketConnectorAdapterOptions } from "./factories/web-socket-connector-adapter.factory";
export {
	createSocketConnectorAdapter,
	createWebSocketConnectorAdapter,
} from "./factories/web-socket-connector-adapter.factory";
export type { IWebSocketConnectorAdapterOptions } from "./interfaces/web-socket-connector-options.interface";
