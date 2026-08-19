/**
 * @overview Browser/global WebSocket Connector Adapter factory.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnectorAdapter } from "@husky-di/remote";

import { WebSocketConnectorAdapterImpl } from "@/impls/web-socket-connector-adapter.impl";
import type { IWebSocketConnectorAdapterOptions } from "@/interfaces/web-socket-options.interface";
import type { IWebSocketLike } from "@/interfaces/web-socket-platform.interface";
import { normalizeWebSocketTransportLimits } from "@/utils/web-socket-policy.util";

/** Creates a cold Connector Adapter backed by the supplied or global WebSocket. */
export function createWebSocketConnectorAdapter(
	options: IWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	if (typeof options !== "object" || options === null) {
		throw new TypeError("WebSocket Connector options must be an object.");
	}
	const limits = normalizeWebSocketTransportLimits(options);
	const WebSocketConstructor = options.webSocket ?? globalThis.WebSocket;
	if (typeof WebSocketConstructor !== "function") {
		throw new TypeError("A WebSocket constructor is required.");
	}
	const protocols = Array.isArray(options.protocols)
		? [...options.protocols]
		: options.protocols;

	return new WebSocketConnectorAdapterImpl(
		() =>
			new WebSocketConstructor(
				options.url,
				protocols as string | string[] | undefined,
			) as unknown as IWebSocketLike,
		limits,
	);
}
