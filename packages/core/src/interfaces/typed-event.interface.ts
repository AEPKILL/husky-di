/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 23:52:38
 */

import type { IDisposable } from "./disposable.interface";

export interface ITypedEvent<
	// biome-ignore lint/suspicious/noExplicitAny: any
	Events extends Record<string | symbol, (...args: any[]) => void>,
> extends IDisposable {
	emit<EventName extends keyof Events>(
		eventName: EventName,
		...args: Parameters<Events[EventName]>
	): void;
	on<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void;
	off<EventName extends keyof Events>(
		eventName: EventName,
		listener: Events[EventName],
	): void;
}
