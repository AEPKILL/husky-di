/**
 * @overview WebSocket Adapter factory input validation.
 * @author AEPKILL
 * @created 2026-08-22 00:00:00
 */

import {
	optionsObjectSchema,
	webSocketConstructorSchema,
	webSocketHeaderValuesSchema,
	webSocketProtocolListSchema,
} from "@/utils/web-socket-schema.util";

export function assertWebSocketOptionsObject(
	value: unknown,
	label: string,
): asserts value is object {
	if (!optionsObjectSchema.safeParse(value).success) {
		throw new TypeError(`${label} options must be an object.`);
	}
}

export function assertWebSocketConstructor(
	value: unknown,
): asserts value is typeof WebSocket {
	if (!webSocketConstructorSchema.safeParse(value).success) {
		throw new TypeError("A WebSocket constructor is required.");
	}
}

export function assertWebSocketHeaders(
	value: unknown,
): asserts value is Readonly<Record<string, string>> {
	const record = optionsObjectSchema.safeParse(value);
	if (
		!record.success ||
		!webSocketHeaderValuesSchema.safeParse(Object.values(record.data)).success
	) {
		throw new TypeError("headers must be a string record.");
	}
}

export function isWebSocketProtocolList(
	value: unknown,
): value is readonly string[] {
	return webSocketProtocolListSchema.safeParse(value).success;
}
