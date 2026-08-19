/**
 * @overview Package-private structural WebSocket platform contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export interface IWebSocketLike {
	binaryType: string;
	readonly bufferedAmount: number;
	readonly readyState: number;
	addEventListener(type: string, listener: (event: Event) => void): void;
	removeEventListener(type: string, listener: (event: Event) => void): void;
	send(data: Uint8Array): void;
	close(code?: number): void;
	terminate?: () => void;
}

export interface IWebSocketTransportLimits {
	readonly maxMessageBytes: number;
	readonly maxQueuedMessages: number;
	readonly maxQueuedBytes: number;
}

export interface INodeWebSocketServerLike {
	on(event: string, listener: (...arguments_: unknown[]) => void): this;
	off(event: string, listener: (...arguments_: unknown[]) => void): this;
	close(): void;
}

export interface ICreatedNodeWebSocketServer {
	readonly server: INodeWebSocketServerLike;
	readonly alreadyListening: boolean;
}
