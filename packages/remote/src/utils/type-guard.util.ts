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

/** Returns whether a value is JavaScript's null primitive. */
export function isNull(value: unknown): value is null {
	return value === null;
}

/** Returns whether a value is a non-null object or function. */
export function isObjectOrFunction(value: unknown): value is object {
	return isNonNullObject(value) || isCallable(value);
}

/** Returns whether JavaScript reports a value's type as object. */
export function isObjectType(value: unknown): value is object | null {
	return typeof value === "object";
}

/** Returns whether a value is a plain record with an ordinary or null prototype. */
export function isPlainRecord(
	value: unknown,
): value is Record<PropertyKey, unknown> {
	if (!isNonNullObject(value) || isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/** Returns whether a value is a positive safe integer. */
export function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Returns whether a value is a JavaScript string primitive. */
export function isString(value: unknown): value is string {
	return typeof value === "string";
}

/** Returns whether a value is JavaScript's undefined primitive. */
export function isUndefined(value: unknown): value is undefined {
	return value === undefined;
}

/** Returns whether a value is a Uint8Array in the current realm. */
export function isUint8Array(value: unknown): value is Uint8Array {
	return value instanceof Uint8Array;
}
