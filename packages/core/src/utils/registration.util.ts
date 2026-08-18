/**
 * Utility functions for working with registrations.
 *
 * @overview
 * Provides shared type guards and helpers for registration-related values.
 *
 * @author AEPKILL
 * @created 2026-06-24 00:56:00
 */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { CoreException } from "@/exceptions/core.exception";
import type { Constructor } from "@/types/constructor.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Checks whether a value can be invoked with `new`.
 *
 * @param value - The value to validate
 * @returns True if the value is a constructor
 */
export function isConstructor(value: unknown): value is Constructor<unknown> {
	if (typeof value !== "function") {
		return false;
	}

	try {
		Reflect.construct(Object, [], value);
		return true;
	} catch {
		return false;
	}
}

/**
 * Checks whether a value is a valid service identifier.
 *
 * @param value - The value to validate
 * @returns True if the value can be used as a service identifier
 */
export function isValidServiceIdentifier(
	value: unknown,
): value is ServiceIdentifier<unknown> {
	return (
		isConstructor(value) ||
		typeof value === "symbol" ||
		typeof value === "string"
	);
}

/**
 * Asserts that a value is a valid service identifier.
 *
 * @param value - The value to validate
 * @throws {CoreException} If the value is not a supported identifier
 */
export function assertValidServiceIdentifier(
	value: unknown,
): asserts value is ServiceIdentifier<unknown> {
	if (!isValidServiceIdentifier(value)) {
		throw new CoreException(
			CoreErrorCodeEnum.E_INVALID_SERVICE_IDENTIFIER,
			"A service identifier must be a constructor, string, or symbol.",
		);
	}
}
