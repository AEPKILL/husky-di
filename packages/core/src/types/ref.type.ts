/**
 * Reference type definitions for lazy service resolution.
 *
 * @overview
 * Defines reference types that allow lazy resolution of services.
 * References can be used to break circular dependencies and defer
 * service instantiation until the reference is actually accessed.
 *
 * @author AEPKILL
 * @created 2021-10-11 11:28:03
 */

/**
 * Immutable reference to a service instance.
 *
 * @typeParam T - The type of the referenced service
 */
export type Ref<T> = {
	/** The current service instance. */
	readonly current: T;
	/** Whether the reference has been resolved (instance created). */
	readonly resolved: boolean;
};

/**
 * Mutable reference type.
 * Used internally for managing reference state.
 *
 * @typeParam T - The type of the referenced service
 */
export type MutableRef<T> = {
	/** The current service instance (optional). */
	current?: T;
};
