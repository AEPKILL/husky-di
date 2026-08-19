/**
 * @overview WebSocket Transport policy validation and defaults.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IWebSocketTransportLimitOptions } from "@/interfaces/web-socket-options.interface";
import type { IWebSocketTransportLimits } from "@/interfaces/web-socket-platform.interface";

const MINIMUM_RPC_MESSAGE_BYTES = 1_048_576;

export function normalizeWebSocketTransportLimits(
	options: IWebSocketTransportLimitOptions,
): IWebSocketTransportLimits {
	const maxMessageBytes = options.maxMessageBytes ?? MINIMUM_RPC_MESSAGE_BYTES;
	assertSafeIntegerAtLeast(
		maxMessageBytes,
		MINIMUM_RPC_MESSAGE_BYTES,
		"maxMessageBytes",
	);
	const maxQueuedMessages = options.maxQueuedMessages ?? 16;
	assertSafeIntegerAtLeast(maxQueuedMessages, 1, "maxQueuedMessages");
	const maxQueuedBytes =
		options.maxQueuedBytes ?? Math.max(4_194_304, maxMessageBytes);
	assertSafeIntegerAtLeast(maxQueuedBytes, maxMessageBytes, "maxQueuedBytes");

	return Object.freeze({
		maxMessageBytes,
		maxQueuedMessages,
		maxQueuedBytes,
	});
}

export function assertSafeIntegerAtLeast(
	value: number,
	minimum: number,
	name: string,
): void {
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new RangeError(
			`${name} must be a safe integer of at least ${minimum}.`,
		);
	}
}
