/**
 * Utility functions for disposable objects.
 *
 * @overview
 * Provides helper functions for working with disposable objects, including
 * assertion functions and conversion utilities for creating disposable
 * instances from cleanup functions.
 *
 * @author AEPKILL
 * @created 2025-07-29 22:36:34
 */

import type { Cleanup, IDisposable } from "@/interfaces/disposable.interface";

/**
 * Creates an assertion function that throws if a disposable object has been disposed.
 *
 * @param name - The name of the disposable object (used in error messages)
 * @returns A type guard function that asserts the object is not disposed
 *
 * @example
 * ```typescript
 * const assertNotDisposed = createAssertNotDisposed("Container");
 * assertNotDisposed(container); // Throws if container is disposed
 * ```
 */
export function createAssertNotDisposed(
	name: string,
): (disposable: IDisposable) => void {
	return (
		disposable: IDisposable,
	): asserts disposable is Omit<IDisposable, "disposed"> & {
		disposed: false;
	} => {
		if (disposable.disposed) {
			throw new Error(`${name} is disposed`);
		}
	};
}

/**
 * Converts a cleanup function into a disposable object.
 *
 * @param cleanup - The cleanup function to execute when disposed
 * @returns A disposable object that executes the cleanup function on disposal
 *
 * @example
 * ```typescript
 * const disposable = toDisposed(() => {
 *   console.log("Cleaning up...");
 * });
 * disposable.dispose(); // Executes the cleanup function
 * ```
 */
export function toDisposed(cleanup: Cleanup): IDisposable {
	let disposed = false;
	return {
		get disposed() {
			return disposed;
		},
		dispose() {
			if (disposed) {
				return;
			}
			disposed = true;
			cleanup();
		},
	};
}
