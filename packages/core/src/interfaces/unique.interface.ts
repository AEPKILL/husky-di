/**
 * Unique identifier interface.
 *
 * @overview
 * Defines a contract for objects that have a unique identifier.
 * Used by containers, registrations, and other objects that need
 * to be uniquely identified within the dependency injection system.
 *
 * @author AEPKILL
 * @created 2025-06-25 23:28:25
 */

/**
 * Interface for objects with a unique identifier.
 *
 * @remarks
 * The identifier can be either a string or a symbol, providing
 * flexibility in how objects are identified. Symbols are useful
 * for creating truly unique identifiers that won't conflict with
 * string-based identifiers.
 */
export interface IUnique {
	/** The unique identifier for the object. */
	readonly id: string | symbol;
}
