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
 * reverse order following pure LIFO semantics.
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
 * Execution Flow (Local wraps Global):
 * ```
 *   execute(params)
 *   |
 *  ▼
 *   Local → Global → Default
 *              │
 *              ▼
 *           Result
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
	 * Builds the middleware executor function with pure LIFO composition strategy.
	 *
	 * Combines global middlewares and local middlewares into a single execution chain
	 * following strict LIFO (Last-In-First-Out) semantics based on registration time.
	 *
	 * **Composition Strategy: Local wraps Global**
	 *
	 * The middleware chain follows the philosophy that:
	 * - **Later-registered middlewares wrap earlier-registered ones**
	 * - **Container-specific context (Local) wraps application-wide context (Global)**
	 *
	 * **Execution Flow (Onion Model):**
	 * ```
	 *   Request enters chain
	 *         ↓
	 *   ┌─────────────────────────┐
	 *   │  Local Middleware N     │ ← Outermost (Last registered, First executed)
	 *   │  ┌───────────────────┐  │
	 *   │  │ Local Middleware 1│  │
	 *   │  │  ┌─────────────┐  │  │
	 *   │  │  │ Global MW N │  │  │
	 *   │  │  │  ┌────────┐ │  │  │
	 *   │  │  │  │Global 1│ │  │  │
	 *   │  │  │  │ ┌────┐ │ │  │  │
	 *   │  │  │  │ │Core│ │ │  │  │ ← Innermost (Provider/Decorator)
	 *   │  │  │  │ └────┘ │ │  │  │
	 *   │  │  │  └────────┘ │  │  │
	 *   │  │  └─────────────┘  │  │
	 *   │  └───────────────────┘  │
	 *   └─────────────────────────┘
	 *         ↓
	 *   Result returns through layers
	 * ```
	 *
	 * **Array Order vs Execution Order:**
	 * - Array: `[Global_1, Global_2, ..., Local_1, Local_2, ...]`
	 * - Execution: `Local_2 → Local_1 → ... → Global_2 → Global_1 → Core`
	 *
	 * **Key Capabilities:**
	 * 1. **Override**: Local middlewares can bypass global logic by not calling `next()`
	 * 2. **Intercept**: Local middlewares see and can modify all parameters/results
	 * 3. **Context Enrichment**: Local can inject context before passing to global
	 * 4. **Testing/Mocking**: Container-specific middlewares can replace global behavior
	 *
	 * **Why This Order:**
	 * - Global middlewares are typically registered during application initialization (earlier in time)
	 * - Local middlewares are registered when container is configured (later in time)
	 * - Following LIFO: later registrations should wrap earlier registrations
	 * - This gives container-specific logic the power to control and override global behavior
	 *
	 * **Important: Middleware Independence from Container Hierarchy**
	 * - Local middlewares belong to a specific container instance only
	 * - Parent-child container relationships do NOT affect middleware execution
	 * - Each container has its own independent local middleware chain
	 * - Global middlewares are shared across all containers (not inherited through hierarchy)
	 *
	 * @returns The composed middleware executor function
	 *
	 * @remarks
	 * The reduce operation builds the chain from left to right in the array,
	 * but each element wraps the previous accumulated chain, so the rightmost
	 * element (last in array) becomes the outermost wrapper (first to execute).
	 *
	 * Example with [A, B, C]:
	 * - Step 1: (params) => A.executor(params, default)
	 * - Step 2: (params) => B.executor(params, step1)
	 * - Step 3: (params) => C.executor(params, step2)
	 * - Result: C wraps B wraps A wraps default → Execution: C → B → A → default
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
