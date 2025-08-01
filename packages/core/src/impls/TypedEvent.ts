/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 23:58:33
 */

import type { ITypedEvent } from "@/interfaces/typed-event.interface";
import { createAssertNotDisposed } from "@/utils/disposable.utils";
import { Disposable } from "./Disposable";

const assertNotDisposed = createAssertNotDisposed("TypedEvent");
export class TypedEvent<
		// biome-ignore lint/suspicious/noExplicitAny: any
		Events extends Record<string | symbol, (...args: any[]) => void>,
	>
	extends Disposable
	implements ITypedEvent<Events>
{
	/**
	 * 存储事件监听器的映射表
	 * 键为事件名称，值为该事件的所有监听器数组
	 */
	// biome-ignore lint/suspicious/noExplicitAny: any
	private listeners = new Map<keyof Events, Set<(...args: any[]) => void>>();

	constructor() {
		super(() => {
			this.listeners.clear();
		});
	}

	/**
	 * 触发指定事件
	 * @param eventName 事件名称
	 * @param args 传递给监听器的参数
	 */
	emit<EventName extends keyof Events>(
		eventName: EventName,
		...args: Parameters<Events[EventName]>
	): void {
		assertNotDisposed(this);

		const eventListeners = this.listeners.get(eventName);
		if (eventListeners) {
			for (const listener of eventListeners.values()) {
				listener(...args);
			}
		}
	}

	/**
	 * 注册事件监听器
	 * @param eventName 事件名称
	 * @param listener 监听器函数
	 */
	on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void {
		assertNotDisposed(this);

		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		// biome-ignore lint/style/noNonNullAssertion: this.listeners.get(eventName) is not null
		this.listeners.get(eventName)!.add(listener);
	}

	/**
	 * 移除事件监听器
	 * @param eventName 事件名称
	 * @param listener 要移除的监听器函数
	 */
	off<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void {
		assertNotDisposed(this);

		const eventListeners = this.listeners.get(eventName);
		if (eventListeners) {
			eventListeners.delete(listener);
			if (eventListeners.size === 0) {
				this.listeners.delete(eventName);
			}
		}
	}
}
