/**
 * Typed event emitter interface.
 *
 * @overview
 * Defines a type-safe event emitter interface with disposable listener state.
 *
 * @author AEPKILL
 * @created 2025-07-26 23:52:38
 */

import type { Cleanup, IDisposable } from "./disposable.interface";

/** Type-safe event emission and subscription. */
export interface ITypedEvent<
	// biome-ignore lint/suspicious/noExplicitAny: Event signatures may accept any argument types.
	Events extends Record<string | symbol, (...args: any[]) => void>,
> extends IDisposable {
	emit<EventName extends keyof Events>(
		eventName: EventName,
		...args: Parameters<Events[EventName]>
	): void;

	on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): Cleanup;

	off<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void;
}
