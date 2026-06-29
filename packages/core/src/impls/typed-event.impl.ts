/**
 * Typed event emitter implementation.
 *
 * @overview
 * Implements a type-safe event emitter that provides compile-time type checking
 * for event names and their corresponding listener signatures. Extends
 * DisposableRegistryImpl to automatically clean up listeners on disposal.
 *
 * @author AEPKILL
 * @created 2025-07-26 23:58:33
 */

import { DisposableRegistryImpl } from "@/impls/disposable-registry.impl";
import type { Cleanup } from "@/interfaces/disposable.interface";
import type { ITypedEvent } from "@/interfaces/typed-event.interface";
import { createAssertNotDisposed } from "@/utils/disposable.util";

const assertNotDisposed = createAssertNotDisposed("TypedEvent");

/**
 * Type-safe event emitter implementation.
 *
 * @typeParam Events - A record mapping event names to their listener function signatures
 *
 * @remarks
 * Provides type-safe event emission and listening. When disposed, all listeners
 * are automatically cleared to prevent memory leaks.
 */
export class TypedEventImpl<
		// biome-ignore lint/suspicious/noExplicitAny: any
		Events extends Record<string | symbol, (...args: any[]) => void>,
	>
	extends DisposableRegistryImpl
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
	 * Emits an event with the given name and arguments.
	 *
	 * @typeParam EventName - The name of the event to emit
	 * @param eventName - The name of the event
	 * @param args - The arguments to pass to event listeners
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
	 * Registers an event listener.
	 *
	 * @typeParam EventName - The name of the event to listen to
	 * @param eventName - The name of the event
	 * @param listener - The listener function to call when the event is emitted
	 * @returns A cleanup function that removes the listener
	 */
	public on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): Cleanup {
		assertNotDisposed(this);

		if (!this.listeners.has(eventName)) {
			this.listeners.set(eventName, new Set());
		}
		// biome-ignore lint/style/noNonNullAssertion: this.listeners.get(eventName) is not null
		this.listeners.get(eventName)!.add(listener);

		return () => this.off(eventName, listener);
	}

	/**
	 * Removes an event listener.
	 *
	 * @typeParam EventName - The name of the event
	 * @param eventName - The name of the event
	 * @param listener - The listener function to remove
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
