/**
 * @overview Middleware chain implementation class
 * @author AEPKILL
 * @created 2025-07-26 22:07:03
 */

import { MiddlewareManager } from "@/impls/MiddlewareManager";
import type {
	IMiddlewareChain,
	IMiddlewareManager,
	Middleware,
	MiddlewareExecutor,
} from "@/interfaces/middleware-chain.interface";

/**
 * Middleware chain class
 *
 * Manages and executes a series of middlewares with support for chaining and event listening.
 * The middleware chain combines global middlewares and local middlewares, executing them in
 * reverse order (last added middleware executes first).
 *
 * @example
 * ```typescript
 * const defaultExecutor = (params: string) => params.toUpperCase();
 * const globalMiddleware = new MiddlewareManager();
 * const chain = new MiddlewareChain(defaultExecutor, globalMiddleware, []);
 *
 * chain.use({ name: 'log', executor: (params, next) => {
 *   console.log('Before:', params);
 *   const result = next(params);
 *   console.log('After:', result);
 *   return result;
 * }});
 *
 * const result = chain.execute('hello'); // Executes middleware chain
 * ```
 *
 * @template Params The parameter type passed to middlewares
 * @template Result The return type of the middleware chain execution
 *
 * @remarks
 * Execution Flow (Last-in-First-out):
 * ```
 *   execute(params)
 *   |
 *  ▼
 *   A → B → C → Default
 *        │
 *        ▼
 *     Result
 * ```
 */
export class MiddlewareChain<Params, Result>
	extends MiddlewareManager<Params, Result>
	implements IMiddlewareChain<Params, Result>
{
	/** The composed middleware executor function */
	private _middlewareExecutor: MiddlewareExecutor<Params, Result>;

	/** The default executor used as the final handler in the chain */
	private _defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>;

	/** The global middleware manager that provides shared middlewares */
	private _globalMiddleware: IMiddlewareManager<Params, Result>;

	/**
	 * Gets the global middleware manager
	 * @returns The global middleware manager instance
	 */
	get globalMiddleware(): IMiddlewareManager<Params, Result> {
		return this._globalMiddleware;
	}

	/**
	 * Creates a new middleware chain instance
	 * @param defaultMiddlewareExecutor The default executor function used as the final handler
	 * @param globalMiddleware The global middleware manager providing shared middlewares
	 * @param middlewares Initial local middlewares to register
	 */
	constructor(
		defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>,
		globalMiddleware: IMiddlewareManager<Params, Result>,
		middlewares: Middleware<Params, Result>[],
	) {
		super(middlewares);
		this._globalMiddleware = globalMiddleware;
		this._defaultMiddlewareExecutor = defaultMiddlewareExecutor;
		this._middlewareExecutor = this.buildMiddlewareExecutor();

		// Rebuild executor when local middlewares change
		this.on("change", () => {
			this._middlewareExecutor = this.buildMiddlewareExecutor();
		});

		// Rebuild executor when global middlewares change
		this.addDisposable(
			this._globalMiddleware.on("change", () => {
				this._middlewareExecutor = this.buildMiddlewareExecutor();
			}),
		);
	}

	/**
	 * Executes the middleware chain with the given parameters
	 * @param params The parameters to pass through the middleware chain
	 * @returns The result after all middlewares have been executed
	 */
	execute(params: Params): Result {
		return this._middlewareExecutor(params);
	}

	/**
	 * Builds the middleware executor function
	 *
	 * Combines global middlewares and local middlewares into a single execution chain.
	 * The execution order is reverse: the last middleware added will be the first to execute.
	 *
	 * Execution flow:
	 * 1. Global middlewares (in reverse order of addition)
	 * 2. Local middlewares (in reverse order of addition)
	 * 3. Default middleware executor (final handler)
	 *
	 * Each middleware can:
	 * - Process the parameters before passing to next middleware
	 * - Modify the result after receiving it from next middleware
	 * - Skip calling next() to short-circuit the chain
	 *
	 * @returns The composed middleware executor function
	 *
	 * @remarks
	 * The reduce operation builds the chain from right to left:
	 * - Starts with the default executor as the base
	 * - Wraps each middleware around the previous chain
	 * - Last middleware added becomes the outermost wrapper (executes first)
	 */
	buildMiddlewareExecutor(): MiddlewareExecutor<Params, Result> {
		return [...this._globalMiddleware.middlewares, ...this.middlewares].reduce(
			(next, middleware) => {
				return (params: Params) => {
					// Emit 'before' event before middleware execution
					this.emit("before", middleware, params);
					try {
						// Execute current middleware, passing the next middleware in chain
						const result = middleware.executor(params, next);
						// Emit 'after' event after successful middleware execution
						this.emit("after", middleware, params, result);
						return result;
					} catch (error: unknown) {
						// Emit 'error' event when middleware execution fails
						this.emit("error", middleware, params, error);
						throw error;
					}
				};
			},
			this._defaultMiddlewareExecutor,
		);
	}
}
