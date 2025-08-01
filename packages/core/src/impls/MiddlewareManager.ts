/**
 * @overview 中间件管理器实现类
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

const assertNotDisposed = createAssertNotDisposed("MiddlewareManager");

/**
 * 中间件管理器类
 * 用于管理中间件列表，提供添加、移除、检查存在性和获取所有中间件的功能
 * @template Params 中间件参数类型
 * @template Result 中间件返回结果类型
 */
export class MiddlewareManager<Params, Result>
	extends TypedEvent<MiddlewareChainEvents<Params, Result>>
	implements IMiddlewareManager<Params, Result>
{
	/** 存储所有注册的中间件 */
	private _middlewares: Middleware<Params, Result>[] = [];

	constructor(middlewares: Middleware<Params, Result>[] = []) {
		super();
		this._middlewares = middlewares;
	}

	/**
	 * 获取所有中间件的只读数组
	 * @returns 返回所有中间件的副本数组
	 */
	get middlewares(): Middleware<Params, Result>[] {
		return [...this._middlewares];
	}

	/**
	 * 添加一个或多个中间件到管理器中
	 * @param middlewares 要添加的中间件数组
	 */
	use(...middlewares: Middleware<Params, Result>[]): void {
		assertNotDisposed(this);

		let hasAdded = false;
		for (const middleware of middlewares) {
			// 检查中间件是否已存在，避免重复添加
			if (this.has(middleware)) {
				console.warn(
					`Middleware ${String(middleware.name)} already exists, skip it`,
				);
				continue;
			}

			// 添加中间件
			this._middlewares.push(middleware);
			hasAdded = true;
		}

		// 如果有中间件被添加，触发 change 事件，通知监听器中间件列表已发生变化
		if (hasAdded) {
			this.emit("change", this._middlewares);
		}
	}

	/**
	 * 从管理器中移除指定的中间件
	 * @param middlewares 要移除的中间件数组
	 */
	unused(...middlewares: Middleware<Params, Result>[]): void {
		assertNotDisposed(this);

		let hasRemoved = false;

		for (const middleware of middlewares) {
			// 遍历所有中间件，找到匹配的并移除
			for (let i = 0; i < this._middlewares.length; i++) {
				if (equal(this._middlewares[i], middleware)) {
					this._middlewares.splice(i, 1);
					hasRemoved = true;
					break;
				}
			}
		}

		// 如果有中间件被移除，触发 change 事件
		if (hasRemoved) {
			this.emit("change", this._middlewares);
		}
	}

	/**
	 * 检查指定的中间件是否已存在于管理器中
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
	 * 获取管理器中所有的中间件
	 * @returns 返回所有中间件的副本数组
	 */
	all(): Middleware<Params, Result>[] {
		return [...this._middlewares];
	}

	dispose(): void {
		if (this.disposed) return;
		super.dispose();
	}
}
