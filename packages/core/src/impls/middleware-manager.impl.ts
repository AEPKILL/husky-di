/**
 * @overview Global middleware manager implementation.
 * @author AEPKILL
 * @created 2025-07-31 23:22:23
 */

import type { IContainer } from "@/interfaces/container.interface";
import type { Cleanup } from "@/interfaces/disposable.interface";
import type {
	IMiddlewareManager,
	Middleware,
	MiddlewareExecutor,
} from "@/interfaces/middleware.interface";

type MiddlewarePipelineExecutor<Params, Result> = (
	params: Params,
	terminal: MiddlewareExecutor<Params, Result>,
) => Result;

/** Manages and executes the single application-wide middleware pipeline. */
export class MiddlewareManagerImpl<Params, Result>
	implements IMiddlewareManager<Params, Result>
{
	private readonly _middlewares: Middleware<Params, Result>[] = [];
	private _executor: MiddlewarePipelineExecutor<Params, Result> = (
		params,
		terminal,
	) => terminal(params);

	/** Registers middleware and returns its sole, idempotent removal handle. */
	public use(...middlewares: Middleware<Params, Result>[]): Cleanup {
		const addedMiddlewares: Middleware<Params, Result>[] = [];

		for (const middleware of middlewares) {
			if (this._middlewares.includes(middleware)) {
				console.warn(
					`Middleware ${String(middleware.name)} already exists, skip it`,
				);
				continue;
			}

			this._middlewares.push(middleware);
			addedMiddlewares.push(middleware);
		}

		if (addedMiddlewares.length > 0) {
			this._executor = this._buildExecutor();
		}

		let cleaned = false;
		return () => {
			if (cleaned) {
				return;
			}
			cleaned = true;

			let changed = false;
			for (const middleware of addedMiddlewares) {
				const index = this._middlewares.indexOf(middleware);
				if (index >= 0) {
					this._middlewares.splice(index, 1);
					changed = true;
				}
			}

			if (changed) {
				this._executor = this._buildExecutor();
			}
		};
	}

	/** Executes the current middleware snapshot around a terminal provider. */
	public execute(
		params: Params,
		terminal: MiddlewareExecutor<Params, Result>,
	): Result {
		return this._executor(params, terminal);
	}

	/** Notifies active global middleware that a container was disposed. */
	public notifyContainerDispose(container: IContainer): void {
		for (const middleware of [...this._middlewares]) {
			try {
				middleware.onContainerDispose?.(container);
			} catch {
				// A middleware hook must not interrupt container disposal.
			}
		}
	}

	private _buildExecutor(): MiddlewarePipelineExecutor<Params, Result> {
		return this._middlewares.reduce<MiddlewarePipelineExecutor<Params, Result>>(
			(next, middleware) => (params, terminal) =>
				middleware.executor(params, (nextParams) => next(nextParams, terminal)),
			(params, terminal) => terminal(params),
		);
	}
}
