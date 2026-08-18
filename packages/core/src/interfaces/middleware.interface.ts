/**
 * Middleware interfaces and type definitions.
 *
 * @overview
 * Defines the application-wide middleware pipeline used to intercept service
 * resolution.
 *
 * @author AEPKILL
 * @created 2025-07-26 21:55:06
 */

import type { IContainer } from "./container.interface";
import type { Cleanup } from "./disposable.interface";

/** Executes the terminal operation of a middleware pipeline. */
export type MiddlewareExecutor<Params, Result> = (params: Params) => Result;

/** Continues execution with the next middleware in the pipeline. */
export type NextMiddleware<Params, Result> = (params: Params) => Result;

/** A named application-wide middleware layer. */
export type Middleware<Params, Result> = {
	/** A name used for diagnostics. */
	name: string | symbol;
	/** The middleware executor function. */
	executor: (params: Params, next: NextMiddleware<Params, Result>) => Result;
	/** Optional callback invoked when any container is disposed. */
	onContainerDispose?: (container: IContainer) => void;
};

/**
 * Public middleware registration interface.
 *
 * @remarks
 * Middleware is application-wide. The returned cleanup is the sole removal
 * authority for the middleware added by that call.
 */
export interface IMiddlewareManager<Params, Result> {
	/**
	 * Adds one or more middleware layers in LIFO order.
	 *
	 * @returns An idempotent cleanup that removes only middleware added by this call.
	 */
	use(...middlewares: Middleware<Params, Result>[]): Cleanup;
}
