/**
 * @overview Minimal declarations for the runtime-only `ws` dependency.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

declare module "ws" {
	export class WebSocket extends EventTarget {
		readonly bufferedAmount: number;
		binaryType: string;
		readonly readyState: number;
		constructor(
			address: string | URL,
			protocols?: string | string[],
			options?: Readonly<Record<string, unknown>>,
		);
		send(data: string | ArrayBuffer | ArrayBufferView): void;
		close(code?: number): void;
		terminate(): void;
	}

	export class WebSocketServer {
		constructor(options: Readonly<Record<string, unknown>>);
		on(event: string, listener: (...arguments_: unknown[]) => void): this;
		off(event: string, listener: (...arguments_: unknown[]) => void): this;
		close(callback?: (error?: Error) => void): void;
	}
}
