/**
 * @overview Preserve trusted native errors and release sockets after their close event.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IWebSocketLike } from "@/shared/interfaces/web-socket-platform.interface";

export function toWebSocketError(value: unknown, fallback: string): Error {
	return value instanceof Error ? value : new Error(fallback);
}
export function getWebSocketEventError(event: Event): Error {
	return toWebSocketError(
		Reflect.get(event, "error"),
		"The WebSocket transport failed.",
	);
}
export function createWebSocketAbortError(): DOMException {
	return new DOMException("WebSocket startup was aborted.", "AbortError");
}
export function disposeWebSocket(socket: IWebSocketLike): void {
	// ws can emit a late error after terminate() cancels a connecting handshake.
	const ignoreError = (): void => {};
	const cleanup = (): void => {
		socket.removeEventListener("error", ignoreError);
		socket.removeEventListener("close", cleanup);
	};
	socket.addEventListener("error", ignoreError);
	socket.addEventListener("close", cleanup);
	try {
		if (socket.terminate) socket.terminate();
		else socket.close(1000);
		if (socket.readyState === 3) cleanup();
	} catch {
		cleanup();
	}
}
