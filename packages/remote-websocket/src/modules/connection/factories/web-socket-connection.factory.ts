/**
 * @overview Assemble one native WebSocket Physical Connection.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { WebSocketConnectionImpl } from "../impls/web-socket-connection.impl";
import type { WebSocketConnectionFactory } from "../interfaces/web-socket-connection.interface";

export const createWebSocketConnection: WebSocketConnectionFactory = (
	options,
) => new WebSocketConnectionImpl(options);
