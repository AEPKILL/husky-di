/**
 * @overview Browser/global WebSocket Connector Adapter factory.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnectorAdapter } from "@husky-di/remote";

import { WebSocketConnectorAdapterImpl } from "@/impls/web-socket-connector-adapter.impl";
import type { IWebSocketConnectorAdapterOptions } from "@/interfaces/web-socket-options.interface";
import type {
	IWebSocketLike,
	IWebSocketNetworkStatus,
} from "@/interfaces/web-socket-platform.interface";
import { normalizeWebSocketTransportLimits } from "@/utils/web-socket-policy.util";
import {
	assertWebSocketConstructor,
	assertWebSocketOptionsObject,
	isWebSocketProtocolList,
} from "@/utils/web-socket-validation.util";

/** Creates a cold Connector Adapter backed by the supplied or global WebSocket. */
export function createWebSocketConnectorAdapter(
	options: IWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	assertWebSocketOptionsObject(options, "WebSocket Connector");
	const limits = normalizeWebSocketTransportLimits(options);
	const WebSocketConstructor = options.webSocket ?? globalThis.WebSocket;
	assertWebSocketConstructor(WebSocketConstructor);
	const protocols = isWebSocketProtocolList(options.protocols)
		? [...options.protocols]
		: options.protocols;

	return new WebSocketConnectorAdapterImpl(
		() =>
			new WebSocketConstructor(
				options.url,
				protocols as string | string[] | undefined,
			) as unknown as IWebSocketLike,
		limits,
		getGlobalNetworkStatus(),
	);
}

function getGlobalNetworkStatus(): IWebSocketNetworkStatus | undefined {
	const browserNavigator = globalThis.navigator;
	// Network status requires the browser event API and a boolean online signal.
	const networkStatusIsUnavailable =
		typeof globalThis.addEventListener !== "function" ||
		typeof globalThis.removeEventListener !== "function" ||
		typeof browserNavigator !== "object" ||
		browserNavigator === null ||
		typeof browserNavigator.onLine !== "boolean";
	if (networkStatusIsUnavailable) {
		return undefined;
	}

	return {
		get online() {
			return browserNavigator.onLine;
		},
		addEventListener: (type, listener) => {
			globalThis.addEventListener(type, listener);
		},
		removeEventListener: (type, listener) => {
			globalThis.removeEventListener(type, listener);
		},
	};
}
