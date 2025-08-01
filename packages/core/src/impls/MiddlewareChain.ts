/**
 * @overview 中间件链实现类
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
 * 中间件链类
 * 用于管理和执行一系列中间件，支持链式调用和事件监听
 * @template Params 中间件参数类型
 * @template Result 中间件返回结果类型
 */
export class MiddlewareChain<Params, Result>
	extends MiddlewareManager<Params, Result>
	implements IMiddlewareChain<Params, Result>
{
	private _middlewareExecutor: MiddlewareExecutor<Params, Result>;
	private _defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>;
	private _globalMiddlewares: IMiddlewareManager<Params, Result>;

	get globalMiddlewares(): IMiddlewareManager<Params, Result> {
		return this._globalMiddlewares;
	}

	constructor(
		defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>,
		globalMiddlewares: IMiddlewareManager<Params, Result>,
		middlewares: Middleware<Params, Result>[],
	) {
		super(middlewares);
		this._defaultMiddlewareExecutor = defaultMiddlewareExecutor;
		this._middlewareExecutor = this.buildMiddlewareExecutor();
		this._globalMiddlewares = globalMiddlewares;
		this.on("change", () => {
			this._middlewareExecutor = this.buildMiddlewareExecutor();
		});
		this._globalMiddlewares.on("change", () => {
			this._middlewareExecutor = this.buildMiddlewareExecutor();
		});
	}

	/**
	 * 执行中间件链
	 * @param params 传递给中间件的参数
	 * @returns 中间件链执行的结果
	 */
	execute(params: Params): Result {
		return this._middlewareExecutor(params);
	}

	/**
	 * 构建中间件执行器
	 * **最后一个加入的中间件会作为第一个中间件执行**
	 * @returns 构建好的中间件执行器函数
	 */
	buildMiddlewareExecutor(): MiddlewareExecutor<Params, Result> {
		return [...this._globalMiddlewares.middlewares, ...this.middlewares].reduce(
			(next, middleware) => {
				return (params: Params) => {
					// 触发中间件执行前的事件
					this.emit("before", middleware, params);
					try {
						// 执行当前中间件，并传递下一个中间件作为参数
						const result = middleware.executor(params, next);
						// 触发中间件执行后的事件
						this.emit("after", middleware, params, result);
						return result;
					} catch (error: unknown) {
						// 触发中间件执行错误的事件
						this.emit("error", middleware, params, error);
						throw error;
					}
				};
			},
			this._defaultMiddlewareExecutor,
		);
	}
}
