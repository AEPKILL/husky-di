/**
 * Dynamic reference implementation for service instances.
 *
 * @overview
 * Implements a dynamic reference that creates a new service instance on
 * every access. Unlike InstanceRef, this implementation does not cache
 * the instance, making it suitable for scenarios where fresh instances
 * are needed each time.
 *
 * @typeParam T - The type of the service instance
 *
 * @author AEPKILL
 * @created 2023-05-26 11:23:17
 */

import type { Ref } from "@/types/ref.type";

/**
 * Dynamic reference implementation that creates instances on every access.
 *
 * @remarks
 * This implementation creates a new instance each time `current` is accessed.
 * The instance is not cached, making it suitable for scenarios where fresh
 * instances are required. The `resolved` flag is set to true after the
 * first access, but new instances are still created on subsequent accesses.
 */
export class InstanceDynamicRef<T> implements Ref<T> {
	private _resolved = false;
	private readonly _createInstance: () => T;

	/**
	 * Creates a new InstanceDynamicRef.
	 *
	 * @param createInstance - The factory function to create instances
	 */
	constructor(createInstance: () => T) {
		this._createInstance = createInstance;
	}

	/**
	 * Gets the current service instance, creating a new one each time.
	 *
	 * @remarks
	 * Unlike InstanceRef, this always creates a new instance on each access.
	 * The resolved flag is set to true after the first access.
	 *
	 * @returns A new service instance
	 */
	get current(): T {
		this._resolved = true;
		return this._createInstance();
	}

	/**
	 * Gets whether the reference has been accessed at least once.
	 *
	 * @returns True if the reference has been accessed, false otherwise
	 */
	get resolved(): boolean {
		return this._resolved;
	}
}
