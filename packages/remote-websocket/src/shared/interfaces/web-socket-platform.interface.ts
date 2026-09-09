/**
 * @overview Native capabilities and bounded policy shared by WebSocket transports.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

export interface IWebSocketLike {
	binaryType: string;
	readonly bufferedAmount: number;
	readonly readyState: number;
	addEventListener(type: string, listener: (event: Event) => void): void;
	removeEventListener(type: string, listener: (event: Event) => void): void;
	send(data: Uint8Array<ArrayBuffer>): void;
	close(code?: number): void;
	terminate?: () => void;
}
export interface IWebSocketTransportLimitOptions {
	readonly maxMessageBytes?: number;
	readonly maxQueuedMessages?: number;
	readonly maxQueuedBytes?: number;
}
export interface IWebSocketTransportLimits {
	readonly maxMessageBytes: number;
	readonly maxQueuedMessages: number;
	readonly maxQueuedBytes: number;
}
export interface IWebSocketNetworkStatus {
	readonly online: boolean;
	addEventListener(type: "offline", listener: () => void): void;
	removeEventListener(type: "offline", listener: () => void): void;
}

export type WebSocketFactory = () => IWebSocketLike;
