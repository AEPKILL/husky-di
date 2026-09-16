/**
 * @overview Runs reusable Remote operations and observes real transport and owner events.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import {
	createRpcReconnectionConnector,
	type IRpcConnectorAdapter,
	type IRpcConnection,
	type IRpcConnector,
	type IRpcConnectorReconnection,
	RpcEventTypeEnum,
	RpcCallDirectionEnum,
} from "@husky-di/remote";
import type { ILabNodeContext } from "@husky-di/example-remote-lab/sdk";
import { lastValueFrom, take, toArray, type Subscription } from "rxjs";
import {
	CALLBACK,
	POLICY,
	SERVICE,
	SHIPPING,
	INSPECTION,
	MISSING_METHOD,
} from "./descriptors";

export async function createClient(
	context: ILabNodeContext,
	createAdapter: () => IRpcConnectorAdapter,
) {
	reconnection = createRpcReconnectionConnector({
		runtimePolicy: { ...POLICY, maxPendingInvocationsPerSession: 8 },
		policy: {
			retryDelaysMs: context.parameters.expectRejected ? [] : [10, 20, 40, 80],
			attemptTimeoutMs: 500,
		},
		adapterFactory: () => {
			const adapter = context.transport(createAdapter());
			lastAdapter = adapter;
			sourceLeft = [];
			sourceRight = [];
			sourceCompleted = 0;
			adapter.connection$.subscribe({
				next: (connection) => {
					currentConnection = connection;
					sourceLeft.push(connection);
				},
				complete: () => sourceCompleted++,
			});
			adapter.connection$.subscribe({
				next: (connection) => sourceRight.push(connection),
				complete: () => sourceCompleted++,
			});
			return adapter;
		},
	});
	connector = reconnection.connector;
	remotes = resolveServices();
	const terminals = connector.event$.subscribe((event) => {
		if (
			event.type === RpcEventTypeEnum.callFinished &&
			event.direction === RpcCallDirectionEnum.outgoing &&
			event.method === "held"
		)
			heldTerminals.push("code" in event ? event.code : event.outcome);
	});
	context.own(() => {
		terminals.unsubscribe();
		for (const item of staticObservers) item.subscription.unsubscribe();
	});
	context.observe(connector, String(context.parameters.label ?? "client"));
	connector.peer.expose(CALLBACK, {
		receive: (message) => {
			if (callbackFails) throw new Error("Intentional callback failure");
			return `${context.parameters.label ?? "client"}: ${message}`;
		},
	});
	context.own(async () => {
		await reconnection.stop();
		await connector.close();
	});
	try {
		await reconnection.connect();
	} catch (error) {
		if (context.parameters.expectRejected)
			return { rejected: true, error: String(error) };
		throw error;
	}
	return {
		rejected: false,
		runtime: typeof window === "undefined" ? "node" : "browser",
	};
}

export async function echo(value: unknown) {
	return remotes.service.echo(value);
}
export async function failure() {
	try {
		await remotes.service.fail();
		return "fulfilled";
	} catch (error) {
		return (error as { code?: string }).code;
	}
}
export async function callback(index: number, message: string) {
	return remotes.service.callback(index, message);
}
export async function cancel() {
	const abort = new AbortController();
	const pending = remotes.service.delayed(500, abort.signal);
	setTimeout(() => abort.abort(), 40);
	try {
		await pending;
		return "fulfilled";
	} catch (error) {
		return (error as { code?: string }).code;
	}
}
export async function stream(count: number) {
	return lastValueFrom(remotes.service.values(count).pipe(toArray()));
}
export async function cancelStream() {
	return lastValueFrom(remotes.service.values(100).pipe(take(2), toArray()));
}
export async function drop() {
	await currentConnection?.close();
}
export async function stopReconnection() {
	await reconnection.stop();
}
export function state() {
	return {
		owner: connector.state,
		peer: connector.peer.state,
		reconnection: reconnection.state,
	};
}
export function startDelayed(ms: number) {
	delayed = remotes.service.delayed(ms, undefined);
	void delayed.catch(() => {});
	return true;
}
export async function finishDelayed() {
	return delayed;
}
export async function shutdown() {
	const shutdown = connector.shutdown();
	const cached = connector.shutdown() === shutdown;
	await shutdown;
	return { cached, state: connector.state };
}
export async function sourceConformance() {
	const adapter = lastAdapter;
	let lateValues = 0;
	let lateCompleted = false;
	adapter.connection$.subscribe({
		next: () => lateValues++,
		complete: () => {
			lateCompleted = true;
		},
	});
	let rejected = false;
	try {
		await adapter.connect(new AbortController().signal);
	} catch {
		rejected = true;
	}
	const retainedResult = await remotes.service.echo(
		"same-handed-off-connection",
	);
	return {
		same:
			sourceLeft.length === 1 &&
			sourceRight.length === 1 &&
			sourceLeft[0] === sourceRight[0] &&
			currentConnection === sourceLeft[0],
		completed: sourceCompleted,
		lateValues,
		lateCompleted,
		rejected,
		retainedResult,
	};
}

export function quote(from: string, to: string, kg: number) {
	return remotes.shipping.quote(from, to, kg);
}
export function inspect() {
	return remotes.inspection.inspect();
}
export function setCallbackFailure(enabled: boolean) {
	callbackFails = enabled;
}
export async function invalidValues() {
	let getters = 0;
	const accessor = {
		get value() {
			getters++;
			return 1;
		},
	};
	const cycle: { self?: unknown } = {};
	cycle.self = cycle;
	const outcomes: string[] = [];
	for (const value of [
		undefined,
		1n,
		Number.NaN,
		new Date(),
		cycle,
		accessor,
	]) {
		try {
			await remotes.service.echo(value);
			outcomes.push("fulfilled");
		} catch (error) {
			outcomes.push(error instanceof TypeError ? "TypeError" : String(error));
		}
	}
	return { outcomes, getters };
}
export async function unknownMethod() {
	try {
		await connector.peer.resolve(MISSING_METHOD).missing();
		return "fulfilled";
	} catch (error) {
		return (error as { code?: string }).code;
	}
}
export async function capacity() {
	const results = await Promise.allSettled(
		Array.from({ length: 12 }, () => remotes.service.delayed(80, undefined)),
	);
	return {
		outcomes: results.map((result) => ({
			outcome: result.status,
			code:
				result.status === "rejected"
					? (result.reason as { code?: string }).code
					: null,
		})),
		recovered: await remotes.service.echo("capacity-released"),
	};
}
export function startHeld(key: string) {
	heldAbort = new AbortController();
	heldTerminals = [];
	heldPromise = remotes.service.held(key, heldAbort.signal);
	void heldPromise.catch(() => {});
}
export async function cancelHeld() {
	heldAbort.abort();
	return heldOutcome();
}
export async function heldOutcome() {
	try {
		await heldPromise;
		return { outcome: "fulfilled", terminals: heldTerminals };
	} catch (error) {
		return {
			outcome: (error as { code?: string }).code,
			terminals: [...heldTerminals],
		};
	}
}
export function openStatic(count: number) {
	const indexes: number[] = [];
	for (let index = 0; index < count; index++) {
		const values: number[] = [];
		const notifications: string[] = [];
		const subscription = remotes.service.changes.subscribe({
			next: (value) => values.push(value),
			complete: () => notifications.push("complete"),
			error: () => notifications.push("error"),
		});
		indexes.push(staticObservers.length);
		staticObservers.push({ subscription, values, notifications });
	}
	return indexes;
}
export function closeStatic(index: number) {
	staticObservers[index].subscription.unsubscribe();
}
export function staticSnapshot() {
	return staticObservers.map(({ values, notifications }) => ({
		values: [...values],
		notifications: [...notifications],
	}));
}

function resolveServices() {
	return {
		service: connector.peer.resolve(SERVICE),
		shipping: connector.peer.resolve(SHIPPING),
		inspection: connector.peer.resolve(INSPECTION),
	};
}
let remotes: ReturnType<typeof resolveServices>;
let callbackFails = false;
let heldAbort: AbortController;
let heldPromise: Promise<unknown>;
let heldTerminals: string[] = [];
let lastAdapter: IRpcConnectorAdapter;
let sourceLeft: IRpcConnection[] = [];
let sourceRight: IRpcConnection[] = [];
let sourceCompleted = 0;
const staticObservers: {
	subscription: Subscription;
	values: number[];
	notifications: string[];
}[] = [];

let connector: IRpcConnector;
let reconnection: IRpcConnectorReconnection;
let currentConnection: IRpcConnection | undefined;
let delayed: Promise<unknown> | undefined;
