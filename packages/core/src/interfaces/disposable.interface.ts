/**
 * Disposable interface for resource cleanup.
 *
 * @overview
 * Defines a contract for objects that manage resources and need to be
 * cleaned up when no longer needed. This pattern is useful for managing
 * lifecycle and preventing resource leaks.
 *
 * @author AEPKILL
 * @created 2022-10-13 17:36:35
 */

/**
 * Function type for cleanup operations.
 *
 * @remarks
 * Used by disposable objects to define cleanup logic that should be
 * executed when the object is disposed.
 */
export type Cleanup = () => void;

/**
 * Interface for objects that can be disposed.
 *
 * @remarks
 * Disposable objects track their disposal state and provide a method
 * to clean up resources. Once disposed, objects should not be used
 * further, and attempts to use them should throw errors.
 */
export interface IDisposable {
	/** Whether the object has been disposed. */
	readonly disposed: boolean;

	/**
	 * Disposes the object and cleans up resources.
	 *
	 * @remarks
	 * This method should be idempotent - calling it multiple times
	 * should have the same effect as calling it once.
	 */
	dispose(): void;
}
