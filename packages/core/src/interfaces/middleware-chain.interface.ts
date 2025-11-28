/**
 * Middleware chain interfaces and type definitions.
 *
 * @overview
 * Defines the middleware pattern for intercepting and processing requests
 * in the dependency injection system. Middleware can be used for logging,
 * validation, caching, and other cross-cutting concerns.
 *
 * @author AEPKILL
 * @created 2025-07-26 21:55:06
 */

import type { IContainer } from "./container.interface";
import type { IDisposable } from "./disposable.interface";
import type { ITypedEvent } from "./typed-event.interface";

/**
 * Function type for executing middleware with parameters.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type MiddlewareExecutor<Params, Result> = (params: Params) => Result;

/**
 * Function type for calling the next middleware in the chain.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type NextMiddleware<Params, Result> = (params: Params) => Result;

/**
 * Middleware definition.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type Middleware<Params, Result> = {
	/** The name of the middleware (for identification and removal) */
	name: string | symbol;
	/** The middleware executor function */
	executor: (params: Params, next: NextMiddleware<Params, Result>) => Result;
	/** Optional callback invoked when the container is disposed */
	onContainerDispose?: (container: IContainer) => void;
};

/**
 * Listener function called before middleware execution.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type MiddlewareBeforeListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
) => void;

/**
 * Listener function called after middleware execution.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type MiddlewareAfterListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
	result: Result,
) => void;

/**
 * Listener function called when middleware execution throws an error.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type MiddlewareErrorListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
	error: unknown,
) => void;

/**
 * Event types emitted by the middleware chain.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 */
export type MiddlewareChainEvents<Params, Result> = {
	/** Emitted before a middleware executes */
	before: MiddlewareBeforeListener<Params, Result>;
	/** Emitted after a middleware executes successfully */
	after: MiddlewareAfterListener<Params, Result>;
	/** Emitted when a middleware throws an error */
	error: MiddlewareErrorListener<Params, Result>;
	/** Emitted when the middleware list changes */
	change: (middlewares: Middleware<Params, Result>[]) => void;
};

/**
 * Interface for managing middleware.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 *
 * @remarks
 * Provides methods to add, remove, and query middleware. Also emits events
 * for middleware lifecycle (before, after, error) and changes to the
 * middleware list.
 */
export interface IMiddlewareManager<Params, Result>
	extends ITypedEvent<MiddlewareChainEvents<Params, Result>>,
		IDisposable {
	/** The list of registered middlewares */
	readonly middlewares: Middleware<Params, Result>[];

	/**
	 * Adds one or more middlewares to the chain.
	 *
	 * @param middlewares - The middlewares to add
	 */
	use(...middlewares: Middleware<Params, Result>[]): void;

	/**
	 * Removes one or more middlewares from the chain.
	 *
	 * @param middlewares - The middlewares to remove
	 */
	unused(...middlewares: Middleware<Params, Result>[]): void;

	/**
	 * Checks if a middleware is registered.
	 *
	 * @param middleware - The middleware to check
	 * @returns True if the middleware is registered, false otherwise
	 */
	has(middleware: Middleware<Params, Result>): boolean;

	/**
	 * Gets all registered middlewares.
	 *
	 * @returns An array of all registered middlewares
	 */
	all(): Middleware<Params, Result>[];
}

/**
 * Interface for executing middleware chains.
 *
 * @typeParam Params - The parameters type
 * @typeParam Result - The result type
 *
 * @remarks
 * Extends IMiddlewareManager with execution capabilities and access to
 * global middleware. The execute method runs all middlewares in sequence,
 * including global middlewares.
 */
export interface IMiddlewareChain<Params, Result>
	extends IMiddlewareManager<Params, Result> {
	/** The global middleware manager (shared across all chains) */
	readonly globalMiddleware: IMiddlewareManager<Params, Result>;

	/**
	 * Executes the middleware chain with the given parameters.
	 *
	 * @param params - The parameters to pass through the middleware chain
	 * @returns The result after processing through all middlewares
	 */
	execute(params: Params): Result;
}
