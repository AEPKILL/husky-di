/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 22:07:03
 */

import { TypedEvent } from "@/impls/TypedEvent";
import type {
	IMiddlewareChain,
	Middleware,
	MiddlewareChainEvents,
	MiddlewareExecutor,
} from "@/interfaces/middleware-chain.interface";

function equal<Params, Result>(
	a: Middleware<Params, Result>,
	b: Middleware<Params, Result>,
): boolean {
	return a.name === b.name;
}

export class MiddlewareChain<Params, Result>
	extends TypedEvent<MiddlewareChainEvents<Params, Result>>
	implements IMiddlewareChain<Params, Result>
{
	private _middlewares: Middleware<Params, Result>[];
	private _middlewareExecutor: MiddlewareExecutor<Params, Result>;

	private readonly _defaultMiddlewareExecutor: MiddlewareExecutor<
		Params,
		Result
	>;

	constructor(defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>) {
		super();
		this._defaultMiddlewareExecutor = defaultMiddlewareExecutor;
		this._middlewares = [];
		this._middlewareExecutor = this.buildMiddlewareExecutor();
	}

	use(middleware: Middleware<Params, Result>): void {
		if (this.has(middleware)) {
			console.warn(
				`Middleware ${String(middleware.name)} already exists, skip it`,
			);
			return;
		}

		this._middlewares.push(middleware);
		this._middlewareExecutor = this.buildMiddlewareExecutor();
	}

	unused(middleware: Middleware<Params, Result>): void {
		for (const it of this._middlewares) {
			if (equal(it, middleware)) {
				this._middlewares.splice(this._middlewares.indexOf(it), 1);
				this._middlewareExecutor = this.buildMiddlewareExecutor();
				break;
			}
		}
	}

	has(middleware: Middleware<Params, Result>): boolean {
		for (const it of this._middlewares) {
			if (equal(it, middleware)) {
				return true;
			}
		}
		return false;
	}

	all(): Middleware<Params, Result>[] {
		return [...this._middlewares];
	}

	execute(params: Params): Result {
		return this._middlewareExecutor(params);
	}

	/**
	 * @description build middleware executor
	 * @returns middleware executor
	 */
	buildMiddlewareExecutor(): MiddlewareExecutor<Params, Result> {
		return this._middlewares.reduce((next, middleware) => {
			return (params: Params) => {
				this.emit("before", middleware, params);
				try {
					const result = middleware.executor(params, next);
					this.emit("after", middleware, params, result);
					return result;
				} catch (error: unknown) {
					this.emit("error", middleware, params, error);
					throw error;
				}
			};
		}, this._defaultMiddlewareExecutor);
	}
}
