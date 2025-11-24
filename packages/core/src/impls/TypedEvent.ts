/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 23:58:33
 */

import { DisposableRegistry } from "@/impls/DisposableRegistry";
import type { IDisposable } from "@/interfaces/disposable.interface";
import type { ITypedEvent } from "@/interfaces/typed-event.interface";
import { createAssertNotDisposed, toDisposed } from "@/utils/disposable.utils";

const assertNotDisposed = createAssertNotDisposed("TypedEvent");
export class TypedEvent<
		// biome-ignore lint/suspicious/noExplicitAny: any
		Events extends Record<string | symbol, (...args: any[]) => void>,
	>
	extends DisposableRegistry
	implements ITypedEvent<Events>
{
	// biome-ignore lint/suspicious/noExplicitAny: any
	private listeners = new Map<keyof Events, Set<(...args: any[]) => void>>();

	constructor() {
		super();
		this.addCleanup(() => {
			this.listeners.clear();
		});
	}

	/**
	 * 触发指定事件
	 * @param eventName 事件名称
	 * @param args 传递给监听器的参数
	 */
	public emit<EventName extends keyof Events>(
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
	public on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): IDisposable {
		assertNotDisposed(this);

		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		// biome-ignore lint/style/noNonNullAssertion: this.listeners.get(eventName) is not null
		this.listeners.get(eventName)!.add(listener);

		return toDisposed(() => this.off(eventName, listener));
	}

	/**
	 * 移除事件监听器
	 * @param eventName 事件名称
	 * @param listener 要移除的监听器函数
	 */
	public off<EventName extends keyof Events>(
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
