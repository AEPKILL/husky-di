/**
 * Utility functions for working with registrations.
 *
 * @overview
 * Provides shared type guards and helpers for registration-related values.
 *
 * @author AEPKILL
 * @created 2026-06-24 00:56:00
 */

import type { IRegistration } from "@/interfaces/registration.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

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
		typeof value === "function" ||
		typeof value === "symbol" ||
		(typeof value === "string" && value.length > 0)
	);
}

/**
 * Checks whether a value is a registration handle.
 *
 * @param value - The value to validate
 * @returns True if the value is a registration handle
 */
export function isRegistration(
	value: unknown,
): value is IRegistration<unknown> {
	return typeof value === "object" && value !== null && "provider" in value;
}
