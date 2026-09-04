/**
 * @overview Provides package-private primitive runtime type guards.
 * @author AEPKILL
 * @created 2026-08-26 00:00:00
 */

/** Returns whether a value has JavaScript's Array brand. */
export function isArray(value: unknown): value is readonly unknown[] {
	return Array.isArray(value);
}

/** Returns whether a value has JavaScript's callable brand. */
export function isCallable<T>(
	value: T,
): value is T & ((...arguments_: never[]) => unknown) {
	return typeof value === "function";
}

/** Returns whether a value is a finite JavaScript number. */
export function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

/** Returns whether a value is a non-negative safe integer. */
export function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Returns whether a value is a non-null JavaScript object. */
export function isNonNullObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

/** Returns whether a value is a non-null object or function. */
export function isObjectOrFunction(value: unknown): value is object {
	return isNonNullObject(value) || isCallable(value);
}

/** Returns whether a value is a positive safe integer. */
export function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Returns whether a value is JavaScript's undefined primitive. */
export function isUndefined(value: unknown): value is undefined {
	return value === undefined;
}

/** Returns whether a value is a Uint8Array in the current realm. */
export function isUint8Array(value: unknown): value is Uint8Array {
	return value instanceof Uint8Array;
}
