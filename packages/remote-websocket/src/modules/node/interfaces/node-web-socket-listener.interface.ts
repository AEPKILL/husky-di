/**
 * @overview Listener capabilities consumed by the WebSocket Acceptor lifecycle.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IWebSocketLike } from "@/shared/interfaces/web-socket-platform.interface";
export interface INodeWebSocketListener {
	readonly alreadyListening: boolean;
	onListening(listener: () => void): () => void;
	onConnection(listener: (socket: IWebSocketLike) => void): () => void;
	onError(listener: (error: Error) => void): () => void;
	onClose(listener: () => void): () => void;
	close(): void;
}

export type NodeWebSocketListenerFactory = (
	canAccept: () => boolean,
) => INodeWebSocketListener;
