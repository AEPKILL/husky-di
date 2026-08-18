/**
 * Typed event emitter implementation.
 *
 * @overview
 * Implements type-safe event emission with disposable listener state.
 *
 * @author AEPKILL
 * @created 2025-07-26 23:58:33
 */

import { DisposableRegistryImpl } from "@/impls/disposable-registry.impl";
import type { Cleanup } from "@/interfaces/disposable.interface";
import type { ITypedEvent } from "@/interfaces/typed-event.interface";
import { createAssertNotDisposed } from "@/utils/disposable.util";

const assertNotDisposed = createAssertNotDisposed("TypedEvent");

type Listener = (...args: unknown[]) => void;

/** Type-safe event emitter with idempotent listener cleanup. */
export class TypedEventImpl<
		// biome-ignore lint/suspicious/noExplicitAny: Event signatures may accept any argument types.
		Events extends Record<string | symbol, (...args: any[]) => void>,
	>
	extends DisposableRegistryImpl
	implements ITypedEvent<Events>
{
	private readonly _listeners = new Map<keyof Events, Map<Listener, Cleanup>>();

	constructor() {
		super();
		this.addCleanup(() => this._listeners.clear());
	}

	public emit<EventName extends keyof Events>(
		eventName: EventName,
		...args: Parameters<Events[EventName]>
	): void {
		assertNotDisposed(this);

		const listeners = this._listeners.get(eventName);
		if (!listeners) {
			return;
		}

		for (const listener of [...listeners.keys()]) {
			listener(...args);
		}
	}

	public on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): Cleanup {
		assertNotDisposed(this);

		let listeners = this._listeners.get(eventName);
		if (!listeners) {
			listeners = new Map();
			this._listeners.set(eventName, listeners);
		}

		const existingCleanup = listeners.get(listener);
		if (existingCleanup) {
			return existingCleanup;
		}

		const cleanup = () => {
			if (this.disposed) {
				return;
			}

			const activeListeners = this._listeners.get(eventName);
			if (activeListeners?.get(listener) !== cleanup) {
				return;
			}

			activeListeners.delete(listener);
			if (activeListeners.size === 0) {
				this._listeners.delete(eventName);
			}
		};
		listeners.set(listener, cleanup);
		return cleanup;
	}

	public off<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void {
		assertNotDisposed(this);

		this._listeners.get(eventName)?.get(listener)?.();
	}
}
