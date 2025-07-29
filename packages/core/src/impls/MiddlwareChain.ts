/**
 * @overview 中间件链实现类
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

/**
 * 比较两个中间件是否相等
 * @param a 第一个中间件
 * @param b 第二个中间件
 * @returns 如果两个中间件名称相同则返回 true，否则返回 false
 */
function equal<Params, Result>(
	a: Middleware<Params, Result>,
	b: Middleware<Params, Result>,
): boolean {
	return a.name === b.name;
}

/**
 * 中间件链类
 * 用于管理和执行一系列中间件，支持链式调用和事件监听
 * @template Params 中间件参数类型
 * @template Result 中间件返回结果类型
 */
export class MiddlewareChain<Params, Result>
	extends TypedEvent<MiddlewareChainEvents<Params, Result>>
	implements IMiddlewareChain<Params, Result>
{
	/** 存储所有注册的中间件 */
	private _middlewares: Middleware<Params, Result>[];
	/** 当前构建的中间件执行器 */
	private _middlewareExecutor: MiddlewareExecutor<Params, Result>;
	/** 默认的中间件执行器，当没有中间件时使用 */
	private readonly _defaultMiddlewareExecutor: MiddlewareExecutor<
		Params,
		Result
	>;

	/**
	 * 构造函数
	 * @param defaultMiddlewareExecutor 默认的中间件执行器
	 */
	constructor(defaultMiddlewareExecutor: MiddlewareExecutor<Params, Result>) {
		super();
		this._defaultMiddlewareExecutor = defaultMiddlewareExecutor;
		this._middlewares = [];
		this._middlewareExecutor = this.buildMiddlewareExecutor();
	}

	/**
	 * 添加中间件到链中
	 * @param middleware 要添加的中间件
	 */
	use(middleware: Middleware<Params, Result>): void {
		// 检查中间件是否已存在，避免重复添加
		if (this.has(middleware)) {
			console.warn(
				`Middleware ${String(middleware.name)} already exists, skip it`,
			);
			return;
		}

		// 添加中间件并重新构建执行器
		this._middlewares.push(middleware);
		this._middlewareExecutor = this.buildMiddlewareExecutor();
	}

	/**
	 * 从链中移除指定的中间件
	 * @param middleware 要移除的中间件
	 */
	unused(middleware: Middleware<Params, Result>): void {
		// 遍历所有中间件，找到匹配的并移除
		for (const it of this._middlewares) {
			if (equal(it, middleware)) {
				this._middlewares.splice(this._middlewares.indexOf(it), 1);
				this._middlewareExecutor = this.buildMiddlewareExecutor();
				break;
			}
		}
	}

	/**
	 * 检查指定的中间件是否已存在于链中
	 * @param middleware 要检查的中间件
	 * @returns 如果中间件存在则返回 true，否则返回 false
	 */
	has(middleware: Middleware<Params, Result>): boolean {
		// 遍历所有中间件，检查是否存在匹配的
		for (const it of this._middlewares) {
			if (equal(it, middleware)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 获取链中所有的中间件
	 * @returns 返回所有中间件的副本数组
	 */
	all(): Middleware<Params, Result>[] {
		return [...this._middlewares];
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
		return this._middlewares.reduce((next, middleware) => {
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
		}, this._defaultMiddlewareExecutor);
	}
}
