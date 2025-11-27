/**
 * Derivation interface for cloneable objects.
 *
 * @overview
 * Defines a contract for objects that can be cloned or derived.
 * Used by objects that need to create copies of themselves while
 * maintaining the same structure and behavior.
 *
 * @typeParam T - The type of the cloned object
 *
 * @author AEPKILL
 * @created 2022-10-11 19:09:17
 */

/**
 * Interface for objects that can be cloned.
 *
 * @typeParam T - The type of the cloned object
 */
export interface IDerivation<T> {
	/**
	 * Creates a clone of the object.
	 *
	 * @returns A new instance that is a copy of the current object
	 */
	clone(): T;
}
