/**
 * Typed event emitter interface.
 *
 * @overview
 * Defines a type-safe event emitter interface that provides compile-time
 * type checking for event names and their corresponding listener signatures.
 * This ensures type safety when emitting and listening to events.
 *
 * @author AEPKILL
 * @created 2025-07-26 23:52:38
 */

import type { IDisposable } from "./disposable.interface";

/**
 * Type-safe event emitter interface.
 *
 * @typeParam Events - A record mapping event names to their listener function signatures
 *
 * @remarks
 * This interface provides type-safe event emission and listening. The Events
 * type parameter defines all available events and their listener signatures,
 * enabling compile-time type checking for event names and arguments.
 *
 * @example
 * ```typescript
 * interface MyEvents {
 *   'user:created': (user: User) => void;
 *   'user:deleted': (userId: string) => void;
 * }
 *
 * const emitter: ITypedEvent<MyEvents> = ...;
 * emitter.emit('user:created', user); // Type-safe
 * emitter.on('user:created', (user) => { ... }); // Type-safe
 * ```
 */
export interface ITypedEvent<
	// biome-ignore lint/suspicious/noExplicitAny: any
	Events extends Record<string | symbol, (...args: any[]) => void>,
> extends IDisposable {
	/**
	 * Emits an event with the given name and arguments.
	 *
	 * @typeParam EventName - The name of the event to emit
	 * @param eventName - The name of the event
	 * @param args - The arguments to pass to event listeners
	 */
	emit<EventName extends keyof Events>(
		eventName: EventName,
		...args: Parameters<Events[EventName]>
	): void;

	/**
	 * Registers an event listener.
	 *
	 * @typeParam EventName - The name of the event to listen to
	 * @param eventName - The name of the event
	 * @param listener - The listener function to call when the event is emitted
	 * @returns A disposable object that can be used to remove the listener
	 */
	on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): IDisposable;

	/**
	 * Removes an event listener.
	 *
	 * @typeParam EventName - The name of the event
	 * @param eventName - The name of the event
	 * @param listener - The listener function to remove
	 */
	off<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void;
}
