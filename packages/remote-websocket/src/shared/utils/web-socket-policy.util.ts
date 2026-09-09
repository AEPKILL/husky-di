/**
 * @overview Validate and snapshot finite transport policy without runtime dependencies.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	IWebSocketTransportLimitOptions,
	IWebSocketTransportLimits,
} from "@/shared/interfaces/web-socket-platform.interface";

export function normalizeWebSocketLimits(
	options: IWebSocketTransportLimitOptions,
): IWebSocketTransportLimits {
	if (typeof options !== "object" || options === null)
		throw new TypeError("WebSocket options must be an object.");
	const maxMessageBytes = options.maxMessageBytes ?? 1_048_576;
	const maxQueuedMessages = options.maxQueuedMessages ?? 16;
	const maxQueuedBytes =
		options.maxQueuedBytes ?? Math.max(4_194_304, maxMessageBytes);
	assertInteger(maxMessageBytes, 1_048_576, "maxMessageBytes");
	assertInteger(maxQueuedMessages, 1, "maxQueuedMessages");
	assertInteger(maxQueuedBytes, maxMessageBytes, "maxQueuedBytes");
	return { maxMessageBytes, maxQueuedMessages, maxQueuedBytes };
}
export function assertInteger(
	value: number,
	minimum: number,
	name: string,
	maximum = Number.MAX_SAFE_INTEGER,
): void {
	if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
		throw new RangeError(
			`${name} must be a safe integer in ${minimum}..${maximum}.`,
		);
}
export function normalizeWebSocketAddress(
	url: string | URL,
	protocols?: string | readonly string[],
): { url: string; protocols: string[] | undefined } {
	if (typeof url !== "string" && !(url instanceof URL))
		throw new TypeError("url must be a WebSocket URL.");
	const address = new URL(url);
	if (
		!["ws:", "wss:"].includes(address.protocol) ||
		address.hash ||
		address.username ||
		address.password
	)
		throw new TypeError(
			"url must use ws: or wss: without credentials or a fragment.",
		);
	const list = typeof protocols === "string" ? [protocols] : protocols;
	if (
		list !== undefined &&
		(!Array.isArray(list) ||
			list.some(
				(value) =>
					typeof value !== "string" ||
					!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(value),
			) ||
			new Set(list).size !== list.length)
	)
		throw new TypeError(
			"protocols must contain unique WebSocket subprotocol tokens.",
		);
	return {
		url: address.href,
		protocols: list === undefined ? undefined : [...list],
	};
}
