/**
 * @overview Private connection module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export { createWebSocketConnection } from "./factories/web-socket-connection.factory";
export type {
	IWebSocketConnection,
	WebSocketConnectionFactory,
} from "./interfaces/web-socket-connection.interface";
