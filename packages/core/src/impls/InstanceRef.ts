/**
 * Lazy reference implementation for service instances.
 *
 * @overview
 * Implements a lazy reference that creates the service instance only when
 * first accessed. Once resolved, the instance factory is cleared to allow
 * garbage collection of the resolve record and resolve context.
 *
 * @typeParam T - The type of the service instance
 *
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import type { Ref } from "@/types/ref.type";

/**
 * Lazy reference implementation that creates instances on first access.
 *
 * @remarks
 * This implementation creates the instance only when `current` is first accessed.
 * After resolution, the instance factory is cleared to allow garbage collection
 * of the resolve record and resolve context, reducing memory usage.
 */
export class InstanceRef<T> implements Ref<T> {
	private _current: T | undefined;
	private _resolved = false;
	private _createInstance: (() => T) | null;

	/**
	 * Creates a new InstanceRef.
	 *
	 * @param createInstance - The factory function to create the instance
	 */
	constructor(createInstance: () => T) {
		this._createInstance = createInstance;
	}

	/**
	 * Gets the current service instance, creating it if not yet resolved.
	 *
	 * @remarks
	 * On first access, the instance is created and the factory is cleared.
	 * Subsequent accesses return the cached instance.
	 *
	 * @returns The service instance
	 */
	get current(): T {
		if (!this._resolved) {
			// biome-ignore lint/style/noNonNullAssertion: we promise the instance factory must be not null
			this._current = this._createInstance!();
			this._resolved = true;

			// Clear the instance factory to allow garbage collection of
			// resolveRecord and resolveContext, reducing memory usage
			this._createInstance = null;
		}

		return this._current as T;
	}

	/**
	 * Gets whether the reference has been resolved.
	 *
	 * @returns True if the instance has been created, false otherwise
	 */
	get resolved(): boolean {
		return this._resolved;
	}
}
