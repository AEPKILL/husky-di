/**
 * Utility functions for generating unique identifiers.
 *
 * @overview
 * Provides ID generation utilities for containers, registrations, and
 * resolve records. Uses incremental counters with configurable prefixes
 * to generate unique, readable identifiers.
 *
 * @author AEPKILL
 * @created 2025-06-24 23:09:59
 */

/**
 * Function type for generating unique identifiers.
 *
 * @returns A unique identifier string
 */
export type IdGenerator = () => string;

/**
 * Creates an incremental ID generator factory function.
 *
 * @param prefix - The prefix to use for generated IDs (default: "ID")
 * @returns A function that generates unique IDs with the specified prefix
 *
 * @example
 * ```typescript
 * const generator = incrementalIdFactory("USER");
 * generator(); // "USER-1"
 * generator(); // "USER-2"
 * ```
 */
export function incrementalIdFactory(prefix: string = "ID"): IdGenerator {
	let id = 0;
	return () => {
		id++;
		if (id > Number.MAX_SAFE_INTEGER) {
			id = 0;
		}
		return `${prefix}-${id}`;
	};
}

/**
 * ID generator for container instances.
 *
 * @returns A unique container ID
 */
export const createContainerId: IdGenerator = incrementalIdFactory("CONTAINER");

/**
 * ID generator for registration instances.
 *
 * @returns A unique registration ID
 */
export const createRegistrationId: IdGenerator =
	incrementalIdFactory("REGISTRATION");

/**
 * ID generator for resolve record instances.
 *
 * @returns A unique resolve record ID
 */
export const createResolveRecordId: IdGenerator =
	incrementalIdFactory("RESOLVE_RECORD");
