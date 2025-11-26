/**
 * @overview Middleware manager implementation
 * @author AEPKILL
 * @created 2025-07-31 23:22:23
 */

import { TypedEvent } from "@/impls/TypedEvent";
import type {
	IMiddlewareManager,
	Middleware,
	MiddlewareChainEvents,
} from "@/interfaces/middleware-chain.interface";
import { createAssertNotDisposed } from "@/utils/disposable.utils";

/**
 * Compares two middlewares for equality based on their names
 * @param a The first middleware
 * @param b The second middleware
 * @returns True if the middleware names are the same, otherwise false
 */
function equal<Params, Result>(
	a: Middleware<Params, Result>,
	b: Middleware<Params, Result>,
): boolean {
	return a.name === b.name;
}

const assertNotDisposed = createAssertNotDisposed("MiddlewareManager");

/**
 * Middleware manager class
 *
 * Manages a collection of middlewares with support for adding, removing, checking existence,
 * and retrieving all middlewares. Emits change events when the middleware list is modified.
 *
 * @template Params Middleware parameter type
 * @template Result Middleware return result type
 */
export class MiddlewareManager<Params, Result>
	extends TypedEvent<MiddlewareChainEvents<Params, Result>>
	implements IMiddlewareManager<Params, Result>
{
	/** Stores all registered middlewares */
	private _middlewares: Middleware<Params, Result>[] = [];

	constructor(middlewares: Middleware<Params, Result>[] = []) {
		super();
		this._middlewares = middlewares;
	}

	/**
	 * Gets a read-only array of all middlewares
	 * @returns A copy of all middlewares array
	 */
	get middlewares(): Middleware<Params, Result>[] {
		return [...this._middlewares];
	}

	/**
	 * Adds one or more middlewares to the manager
	 * @param middlewares The middlewares to add
	 */
	use(...middlewares: Middleware<Params, Result>[]): void {
		assertNotDisposed(this);

		let hasAdded = false;
		for (const middleware of middlewares) {
			if (this.has(middleware)) {
				console.warn(
					`Middleware ${String(middleware.name)} already exists, skip it`,
				);
				continue;
			}

			this._middlewares.push(middleware);
			hasAdded = true;
		}

		if (hasAdded) {
			this.emit("change", this._middlewares);
		}
	}

	/**
	 * Removes specified middlewares from the manager
	 * @param middlewares The middlewares to remove
	 */
	unused(...middlewares: Middleware<Params, Result>[]): void {
		assertNotDisposed(this);

		let hasRemoved = false;

		for (const middleware of middlewares) {
			for (let i = 0; i < this._middlewares.length; i++) {
				if (equal(this._middlewares[i], middleware)) {
					this._middlewares.splice(i, 1);
					hasRemoved = true;
					break;
				}
			}
		}

		if (hasRemoved) {
			this.emit("change", this._middlewares);
		}
	}

	/**
	 * Checks if the specified middleware already exists in the manager
	 * @param middleware The middleware to check
	 * @returns True if the middleware exists, otherwise false
	 */
	has(middleware: Middleware<Params, Result>): boolean {
		for (const it of this._middlewares) {
			if (equal(it, middleware)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Gets all middlewares in the manager
	 * @returns A copy of all middlewares array
	 */
	all(): Middleware<Params, Result>[] {
		return [...this._middlewares];
	}
}
