/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-26 23:52:38
 */

export interface ITypedEvent<
	// biome-ignore lint/suspicious/noExplicitAny: any
	Events extends Record<string | symbol, (...args: any[]) => void>,
> {
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
