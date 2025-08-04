/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 21:55:06
 */

import type { IDisposable } from "./disposable.interface";
import type { ITypedEvent } from "./typed-event.interface";

export type MiddlewareExecutor<Params, Result> = (params: Params) => Result;
export type NextMiddleware<Params, Result> = (params: Params) => Result;
export type Middleware<Params, Result> = {
	name: string | symbol;
	executor: (params: Params, next: NextMiddleware<Params, Result>) => Result;
};
export type MiddlewareBeforeListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
) => void;
export type MiddlewareAfterListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
	result: Result,
) => void;
export type MiddlewareErrorListener<Params, Result> = (
	middleware: Middleware<Params, Result>,
	params: Params,
	error: unknown,
) => void;
export type MiddlewareChainEvents<Params, Result> = {
	before: MiddlewareBeforeListener<Params, Result>;
	after: MiddlewareAfterListener<Params, Result>;
	error: MiddlewareErrorListener<Params, Result>;
	change: (middlewares: Middleware<Params, Result>[]) => void;
};

export interface IMiddlewareManager<Params, Result>
	extends ITypedEvent<MiddlewareChainEvents<Params, Result>>,
		IDisposable {
	readonly middlewares: Middleware<Params, Result>[];

	use(...middlewares: Middleware<Params, Result>[]): void;
	unused(...middlewares: Middleware<Params, Result>[]): void;
	has(middleware: Middleware<Params, Result>): boolean;
	all(): Middleware<Params, Result>[];
}

export interface IMiddlewareChain<Params, Result>
	extends IMiddlewareManager<Params, Result> {
	readonly globalMiddleware: IMiddlewareManager<Params, Result>;
	execute(params: Params): Result;
}
