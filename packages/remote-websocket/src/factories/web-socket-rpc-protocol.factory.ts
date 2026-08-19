/**
 * @overview Creates the WebSocket package RPC Protocol implementation.
 * @author AEPKILL
 * @created 2026-08-19 10:00:00
 */

import type { IRpcProtocol } from "@husky-di/remote";

import { WebSocketRpcProtocolImpl } from "@/impls/web-socket-rpc-protocol.impl";

/** Creates an immutable reusable RPC Protocol with fresh role runtimes. */
export function createWebSocketRpcProtocol(): IRpcProtocol {
	return Object.freeze(new WebSocketRpcProtocolImpl());
}
