/**
 * Exception thrown during service resolution failures.
 *
 * @overview
 * Custom error class for dependency resolution errors, including circular
 * dependency detection. Provides detailed error messages with resolution
 * paths and cycle information for debugging.
 *
 * @author AEPKILL
 * @created 2023-05-24 09:32:03
 */

import type { IResolveRecord } from "@/interfaces/resolve-record.interface";
import { getResolveRecordMessage } from "@/utils/resolve-record.utils";

/**
 * Exception class for service resolution errors.
 *
 * @remarks
 * This exception is thrown when service resolution fails, such as when
 * a service cannot be found, circular dependencies are detected, or
 * other resolution errors occur. The error message includes the full
 * resolution path and cycle information for debugging.
 */
export class ResolveException extends Error {
	/** Internal marker to identify ResolveException instances across frames. */
	private __isResolveException__ = true;

	/**
	 * Creates a new ResolveException.
	 *
	 * @param message - The error message describing the resolution failure
	 * @param resolveRecord - The resolve record containing the resolution path and cycle information
	 */
	constructor(message: string, resolveRecord: IResolveRecord) {
		const cycleNodeInfo = resolveRecord.getCycleNodeInfo();
		const cycleNode = cycleNodeInfo?.cycleNode.value;
		const paths = resolveRecord
			.getPaths()
			.map((it) => it.value)
			.reverse();

		super(
			getResolveRecordMessage({
				message,
				paths,
				cycleNode,
			}),
		);
	}

	/**
	 * Type guard to check if an error is a ResolveException.
	 *
	 * @remarks
	 * Uses an internal marker instead of instanceof to work correctly
	 * across different execution contexts (e.g., different frames or modules).
	 *
	 * @param error - The error to check
	 * @returns True if the error is a ResolveException, false otherwise
	 */
	static isResolveException(error: unknown): error is ResolveException {
		// Don't use instanceof, because it will be false when the error is not in the same frame
		return (
			(error as unknown as ResolveException)?.__isResolveException__ === true
		);
	}
}
