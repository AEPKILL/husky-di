/**
 * @overview Preserves the legacy Lab-owned Observable lifecycle and four-event replay experiment without claiming Remote wire execution.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { ILabNodeContext } from "@husky-di/example-remote-lab/sdk";
import { Observable, share, Subject, type Subscription } from "rxjs";

export enum StreamKindEnum {
	method = "method",
	static = "static",
}
export enum StreamTerminalEnum {
	open = "open",
	complete = "complete",
	error = "error(handler-failed)",
	unavailable = "error(unavailable)",
	canceled = "canceled",
}

export function labNode(context: ILabNodeContext) {
	log = (action, data) => {
		entries.push({ action, data });
		if (entries.length > 200) entries.shift();
		context.log(`Lab-only STREAM instrumentation · ${action}`, {
			instrumentation: true,
			remoteWireExecution: false,
			data,
		});
	};
	context.own(reset);
	return {
		runtime: typeof window === "undefined" ? "node" : "browser",
		instrumentation: true,
		remoteWireExecution: false,
	};
}
export function open(kind: StreamKindEnum) {
	if (kind === StreamKindEnum.static && staticSource.isStopped) {
		staticSource = new Subject<string>();
		sharedStatic = createSharedStatic();
	}
	const id = ++nextId;
	const source =
		kind === StreamKindEnum.static ? staticSource : new Subject<string>();
	const entry: StreamEntry = {
		id,
		kind,
		source,
		terminal: StreamTerminalEnum.open,
		values: [],
		retained: [],
		notifications: [],
	};
	streams.set(id, entry);
	if (kind === StreamKindEnum.method) methodConnections++;
	entry.subscription = (
		kind === StreamKindEnum.static ? sharedStatic : source
	).subscribe({
		next(value) {
			if (connected) entry.values.push(value);
			else if (retained >= 4) finish(entry, StreamTerminalEnum.unavailable);
			else {
				entry.retained.push(value);
				retained++;
			}
		},
		complete() {
			entry.notifications.push("complete");
			finish(entry, StreamTerminalEnum.complete);
		},
		error() {
			entry.notifications.push("error");
			finish(entry, StreamTerminalEnum.error);
		},
	});
	log("open", { id, kind });
	return id;
}
export function next(value: string) {
	if (
		[...streams.values()].some(
			(entry) =>
				entry.kind === StreamKindEnum.static &&
				entry.terminal === StreamTerminalEnum.open,
		)
	)
		staticSource.next(value);
	for (const entry of streams.values())
		if (
			entry.kind === StreamKindEnum.method &&
			entry.terminal === StreamTerminalEnum.open
		)
			entry.source.next(value);
	log("next", { value, connected, retained });
}
export function unsubscribe(id: number) {
	const entry = streams.get(id);
	if (entry) finish(entry, StreamTerminalEnum.canceled);
}
export function complete() {
	for (const entry of streams.values())
		if (entry.terminal === StreamTerminalEnum.open) entry.source.complete();
}
export function error() {
	for (const entry of streams.values())
		if (entry.terminal === StreamTerminalEnum.open)
			entry.source.error(new Error("Lab instrumentation source failure"));
}
export function disconnect() {
	connected = false;
	log("disconnect", { retained });
}
export function recover() {
	connected = true;
	for (const entry of streams.values()) {
		entry.values.push(...entry.retained);
		entry.retained.length = 0;
	}
	log("recover", { replayed: retained });
	retained = 0;
}
export function overflow() {
	disconnect();
	for (let index = 0; index < 5; index++) next(`overflow-${index}`);
}
export function snapshot() {
	return {
		connected,
		retained,
		methodConnections,
		staticConnections,
		staticTeardowns,
		entries: [...entries],
		streams: [...streams.values()].map(
			({ id, kind, terminal, values, retained, notifications }) => ({
				id,
				kind,
				terminal,
				values: [...values],
				retained: retained.length,
				notifications: [...notifications],
			}),
		),
	};
}
export function reset() {
	for (const entry of streams.values()) entry.subscription?.unsubscribe();
	streams.clear();
	entries.length = 0;
	retained = 0;
	connected = true;
	nextId = 0;
	methodConnections = 0;
	staticConnections = 0;
	staticTeardowns = 0;
	staticSource = new Subject<string>();
	sharedStatic = createSharedStatic();
}

type StreamEntry = {
	id: number;
	kind: StreamKindEnum;
	source: Subject<string>;
	subscription?: Subscription;
	terminal: StreamTerminalEnum;
	values: string[];
	retained: string[];
	notifications: string[];
};

function finish(entry: StreamEntry, terminal: StreamTerminalEnum) {
	if (entry.terminal !== StreamTerminalEnum.open) return;
	entry.terminal = terminal;
	retained -= entry.retained.length;
	entry.retained.length = 0;
	entry.subscription?.unsubscribe();
	log("terminal", {
		id: entry.id,
		terminal,
		silent: terminal === StreamTerminalEnum.canceled,
	});
}

const streams = new Map<number, StreamEntry>();
const entries: { action: string; data: unknown }[] = [];
let staticSource = new Subject<string>();
let sharedStatic = createSharedStatic();

let log: (action: string, data: unknown) => void;
let nextId = 0;
let retained = 0;
let connected = true;
let methodConnections = 0;
let staticConnections = 0;
let staticTeardowns = 0;

function createSharedStatic() {
	const source = staticSource;
	return new Observable<string>((subscriber) => {
		staticConnections++;
		const subscription = source.subscribe(subscriber);
		return () => {
			staticTeardowns++;
			subscription.unsubscribe();
		};
	}).pipe(share());
}
