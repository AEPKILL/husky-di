/**
 * @overview WebSocket Transport runtime validation schemas.
 * @author AEPKILL
 * @created 2026-08-22 00:00:00
 */

import { z } from "zod";

export const arrayBufferMessageSchema = z.instanceof(ArrayBuffer);
export const arrayBufferViewMessageSchema = z.custom<ArrayBufferView>(
	ArrayBuffer.isView,
);
export const blobMessageSchema = z.instanceof(Blob);
export const byteMessageSchema = z.instanceof(Uint8Array);
export const errorSchema = z.instanceof(Error);
export const optionsObjectSchema = z.custom<object>(
	(value) => typeof value === "object" && value !== null,
);
export const textMessageSchema = z.string();
export const webSocketConstructorSchema = z.function();
export const webSocketHeaderValuesSchema = z.array(z.string());
export const webSocketProtocolListSchema = z.custom<readonly string[]>(
	Array.isArray,
);

export function createSafeIntegerAtLeastSchema(minimum: number) {
	return z.int().min(minimum);
}

export function createSafeIntegerAtMostSchema(maximum: number) {
	return z.int().max(maximum);
}
