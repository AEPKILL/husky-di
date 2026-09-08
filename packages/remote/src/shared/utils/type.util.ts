/**
 * @overview Shared runtime type guards.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

/** Narrows an unknown value to a non-null object. */
export function isNonNullObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}
