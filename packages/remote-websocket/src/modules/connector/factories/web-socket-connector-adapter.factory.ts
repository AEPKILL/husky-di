/**
 * @overview Assemble browser and platform-neutral WebSocket Connector Adapters.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { IRpcConnectorAdapter } from "@husky-di/remote/transport";
import { createWebSocketConnection } from "@/modules/connection";
import type { IWebSocketNetworkStatus } from "@/shared/interfaces/web-socket-platform.interface";
import {
	normalizeWebSocketAddress,
	normalizeWebSocketLimits,
} from "@/shared/utils/web-socket-policy.util";
import {
	type CreateWebSocketConnectorAdapterOptions,
	WebSocketConnectorAdapterImpl,
} from "../impls/web-socket-connector-adapter.impl";
import type { IWebSocketConnectorAdapterOptions } from "../interfaces/web-socket-connector-options.interface";

export type CreateSocketConnectorAdapterOptions = Omit<
	CreateWebSocketConnectorAdapterOptions,
	"createConnection"
>;

export function createWebSocketConnectorAdapter(
	options: IWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	const limits = normalizeWebSocketLimits(options);
	const { url, protocols } = normalizeWebSocketAddress(
		options.url,
		options.protocols,
	);
	const Socket = options.webSocket ?? globalThis.WebSocket;
	if (typeof Socket !== "function")
		throw new TypeError("A WebSocket constructor is required.");
	return createSocketConnectorAdapter({
		createSocket: () => new Socket(url, protocols),
		limits,
		networkStatus: getBrowserNetworkStatus(),
	});
}
export function createSocketConnectorAdapter(
	options: CreateSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	return new WebSocketConnectorAdapterImpl({
		...options,
		createConnection: createWebSocketConnection,
	});
}
function getBrowserNetworkStatus(): IWebSocketNetworkStatus | undefined {
	if (
		typeof globalThis.addEventListener !== "function" ||
		typeof globalThis.removeEventListener !== "function" ||
		typeof globalThis.navigator?.onLine !== "boolean"
	)
		return undefined;
	return {
		get online() {
			return globalThis.navigator.onLine;
		},
		addEventListener: (type, listener) =>
			globalThis.addEventListener(type, listener),
		removeEventListener: (type, listener) =>
			globalThis.removeEventListener(type, listener),
	};
}
