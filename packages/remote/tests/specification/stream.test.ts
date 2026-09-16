/**
 * @overview Verifies remote Observable execution, source sharing, cancellation and safe terminals.
 * @author AEPKILL
 * @created 2026-09-13 23:04:37
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	EMPTY,
	from,
	lastValueFrom,
	map,
	merge,
	Observable,
	of,
	Subject,
	switchMap,
	throwError,
	toArray,
} from "rxjs";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type RpcAcceptorOptions,
	type RpcConnectorOptions,
	type RpcEvent,
} from "../../src/index";
import type { IRpcProtocolSession } from "../../src/protocol";
import { createRpcTestNetwork } from "../protocol/test.utils";
import { connectProtocolSession } from "./test.utils";

const descriptor = createRemoteServiceDescriptor(
	createServiceIdentifier<{
		values(seed: number): Observable<number>;
		changes: Observable<number>;
	}>("IObservableService"),
	{
		wireName: "example.observable.v2",
		members: {
			values: { kind: "observable-function" },
			changes: { kind: "observable" },
		},
	},
);

async function createPair(
	connectorOptions: RpcConnectorOptions = {},
	acceptorOptions: RpcAcceptorOptions = {},
) {
	const network = createRpcTestNetwork();
	const connector = createRpcConnector(connectorOptions);
	const acceptor = createRpcAcceptor(acceptorOptions);
	onTestFinished(async () => {
		await Promise.all([connector.close(), acceptor.close()]);
	});
	const events: RpcEvent[] = [];
	connector.event$.subscribe((event) => events.push(event));
	acceptor.event$.subscribe((event) => events.push(event));
	await acceptor.listen(network.acceptorAdapter);
	await connector.connect({ adapter: network.createConnectorAdapter() });
	return {
		network,
		connector,
		acceptor,
		events,
		remote: connector.peer.resolve(descriptor),
	};
}

import { createInterceptedPair } from "./test.utils";

describe("Remote Observable streams", () => {
	it("RPC-STREAM-008 cancels an admitted unary invocation after a second interceptor emission", async () => {
		const gate = Promise.withResolvers<void>();
		const settled = Promise.withResolvers<string>();
		onTestFinished(() => {
			gate.resolve();
			settled.resolve("cleanup");
		});
		const pair = await createInterceptedPair({
			interceptor: (_context, next) =>
				merge(next(), from(gate.promise).pipe(switchMap(() => of(1, 2)))),
		});
		pair.cancelHandler.mockImplementation((_value, signal) => {
			signal.addEventListener("abort", () => settled.resolve("canceled"), {
				once: true,
			});
			return settled.promise;
		});
		const result = pair.remote.cancel("value", undefined);
		const rejected = expect(result).rejects.toMatchObject({
			code: "handler-failed",
		});
		await vi.waitFor(() => expect(pair.cancelHandler).toHaveBeenCalledTimes(1));
		gate.resolve();
		await rejected;
		await vi.waitFor(() =>
			expect(pair.cancelHandler.mock.calls[0]?.[1].aborted).toBe(true),
		);
	});

	it("RPC-STREAM-008 adapts zero and one unary emissions and rejects a second emission", async () => {
		for (const incoming of [false, true]) {
			for (const [source, expected] of [
				[EMPTY, undefined],
				[of(7), 7],
			] as const) {
				const options = { interceptor: () => source };
				const pair = await createInterceptedPair(
					incoming ? {} : options,
					incoming ? options : {},
				);
				await expect(pair.remote.add(1, 2)).resolves.toBe(expected);
				expect(pair.handler).not.toHaveBeenCalled();
			}
			const options = { interceptor: () => of(1, 2) };
			const pair = await createInterceptedPair(
				incoming ? {} : options,
				incoming ? options : {},
			);
			await expect(pair.remote.add(1, 2)).rejects.toMatchObject({
				code: "handler-failed",
			});
			expect(pair.connector.peer.state.status).toBe("connected");
		}
	});

	it("RPC-STREAM-002 gives each subscription an independent remote execution and ordered completion", async () => {
		const pair = await createPair();
		const handler = vi.fn((seed: number) => of(seed, seed + 1));
		pair.acceptor.expose(descriptor, {
			values: handler,
			changes: new Subject<number>(),
		});
		const source = pair.remote.values(3);
		expect(handler).not.toHaveBeenCalled();
		await expect(lastValueFrom(source.pipe(toArray()))).resolves.toEqual([
			3, 4,
		]);
		await expect(lastValueFrom(source.pipe(toArray()))).resolves.toEqual([
			3, 4,
		]);
		expect(handler).toHaveBeenCalledTimes(2);
		const opens = pair.network.records.filter(
			(record) =>
				record.value.kind === "message" &&
				(record.value.message as { kind: string }).kind === "stream-open",
		);
		expect(opens).toHaveLength(2);
	});
	it("RPC-STREAM-002 RPC-STREAM-003 RPC-STREAM-004 captures a lazy static source and shares it only within each Peer", async () => {
		const pair = await createPair();
		const values = new Subject<number>();
		let subscriptions = 0;
		let teardowns = 0;
		const implementation = {
			values: (seed: number) => of(seed),
			changes: new Observable<number>((subscriber) => {
				subscriptions += 1;
				const source = values.subscribe(subscriber);
				return () => {
					teardowns += 1;
					source.unsubscribe();
				};
			}),
		};
		pair.acceptor.expose(descriptor, implementation);
		implementation.changes = of(999);
		expect(subscriptions).toBe(0);
		const observed: number[][] = [[], [], []];
		const notifications: string[] = [];
		const first = pair.remote.changes.subscribe({
			next: (value) => observed[0]?.push(value),
			complete: () => notifications.push("complete"),
			error: () => notifications.push("error"),
		});
		const second = pair.remote.changes.subscribe((value) =>
			observed[1]?.push(value),
		);
		await vi.waitFor(() => expect(subscriptions).toBe(1));
		const other = createRpcConnector();
		onTestFinished(() => other.close());
		await other.connect({ adapter: pair.network.createConnectorAdapter() });
		const third = other.peer
			.resolve(descriptor)
			.changes.subscribe((value) => observed[2]?.push(value));
		await vi.waitFor(() => expect(subscriptions).toBe(2));
		values.next(7);
		await vi.waitFor(() => expect(observed).toEqual([[7], [7], [7]]));
		first.unsubscribe();
		await vi.waitFor(() =>
			expect(
				pair.network.records.some(
					(record) =>
						record.value.kind === "message" &&
						(record.value.message as { kind: string }).kind === "stream-cancel",
				),
			).toBe(true),
		);
		expect(teardowns).toBe(0);
		second.unsubscribe();
		await vi.waitFor(() => expect(teardowns).toBe(1));
		third.unsubscribe();
		await vi.waitFor(() => expect(teardowns).toBe(2));
		expect(notifications).toEqual([]);
	});

	it("RPC-STREAM-009 pairs safe open and terminal events even when an open observer closes its Owner", async () => {
		for (const direction of ["outgoing", "incoming"]) {
			const pair = await createPair();
			const handler = vi.fn(() => new Observable<number>(() => undefined));
			pair.acceptor.expose(descriptor, {
				values: handler,
				changes: new Subject<number>(),
			});
			const owner = direction === "outgoing" ? pair.connector : pair.acceptor;
			owner.event$.subscribe((event) => {
				if (event.type === "stream-opened") void owner.close();
			});
			const observations: RpcEvent[] = [];
			owner.event$.subscribe((event) => {
				if (event.type === "stream-opened" || event.type === "stream-finished")
					observations.push(event);
			});
			const subscription = pair.remote
				.values(1)
				.subscribe({ error: () => undefined });
			onTestFinished(() => subscription.unsubscribe());
			await vi.waitFor(() =>
				expect(observations.map((event) => event.type)).toEqual([
					"stream-opened",
					"stream-finished",
				]),
			);
			expect(handler).not.toHaveBeenCalled();
			expect(observations[0]).toMatchObject({
				observationId: expect.any(String),
			});
			expect(observations[1]).toMatchObject({
				observationId: Reflect.get(observations[0] as object, "observationId"),
			});
			for (const event of observations) {
				for (const key of [
					"item",
					"args",
					"value",
					"metadata",
					"error",
					"source",
				])
					expect(event).not.toHaveProperty(key);
			}
		}
	});

	it("RPC-STREAM-005 safely isolates source, invalid result and normalization failures to their stream", async () => {
		const pair = await createPair();
		const source = new Subject<number>();
		const handler = vi.fn((seed: number): Observable<number> => {
			if (seed === 0) throw new Error("private handler failure");
			if (seed === 1) return Promise.resolve(3) as never;
			if (seed === 2)
				return throwError(() => new Error("private source failure"));
			if (seed === 3) return of(() => 4) as never;
			return source;
		});
		pair.acceptor.expose(descriptor, {
			values: handler,
			changes: new Subject<number>(),
		});
		const healthy: number[] = [];
		const subscription = pair.remote
			.values(4)
			.subscribe((value) => healthy.push(value));
		onTestFinished(() => subscription.unsubscribe());
		await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
		for (const seed of [0, 1, 2, 3]) {
			await expect(
				lastValueFrom(pair.remote.values(seed)),
			).rejects.toMatchObject({ code: "handler-failed", cause: undefined });
			expect(pair.connector.peer.state.status).toBe("connected");
		}
		source.next(5);
		await vi.waitFor(() => expect(healthy).toEqual([5]));
	});

	it("RPC-STREAM-008 intercepts each subscription once and transforms all its items with isolated metadata", async () => {
		const incoming = vi.fn();
		let outgoing = 0;
		const pair = await createPair(
			{
				interceptor: (context, next) => {
					outgoing += 1;
					if (context.direction === "outgoing")
						context.metadata = { trace: outgoing };
					return next().pipe(map((value) => Number(value) + 10));
				},
			},
			{
				interceptor: (context, next) => {
					incoming(context.metadata);
					return next().pipe(map((value) => Number(value) * 2));
				},
			},
		);
		pair.acceptor.expose(descriptor, {
			values: (seed) => of(seed, seed + 1),
			changes: new Subject<number>(),
		});
		await expect(
			lastValueFrom(pair.remote.values(2).pipe(toArray())),
		).resolves.toEqual([14, 16]);
		await expect(
			lastValueFrom(pair.remote.values(3).pipe(toArray())),
		).resolves.toEqual([16, 18]);
		expect(outgoing).toBe(2);
		expect(incoming.mock.calls).toEqual([[{ trace: 1 }], [{ trace: 2 }]]);
		for (const event of pair.events)
			expect(event).not.toHaveProperty("metadata");
	});

	it("RPC-STREAM-004 RPC-STREAM-008 tears down suspended outgoing interception without opening a remote stream", async () => {
		const gate = Promise.withResolvers<void>();
		let signal: AbortSignal | undefined;
		let retainedNext: (() => Observable<unknown>) | undefined;
		const pair = await createPair({
			interceptor: (context, next) => {
				signal = context.signal;
				retainedNext = next;
				return from(gate.promise).pipe(switchMap(() => next()));
			},
		});
		const handler = vi.fn((seed: number) => of(seed));
		pair.acceptor.expose(descriptor, {
			values: handler,
			changes: new Subject<number>(),
		});
		const notifications: string[] = [];
		const subscription = pair.remote.values(2).subscribe({
			complete: () => notifications.push("complete"),
			error: () => notifications.push("error"),
		});
		subscription.unsubscribe();
		gate.resolve();
		await Promise.resolve();
		expect(signal?.aborted).toBe(true);
		expect(handler).not.toHaveBeenCalled();
		expect(notifications).toEqual([]);
		expect(
			pair.network.records.filter(
				(record) =>
					record.value.kind === "message" &&
					(record.value.message as { kind: string }).kind === "stream-open",
			),
		).toEqual([]);
		expect(retainedNext).toThrow(TypeError);
	});
	it("RPC-STREAM-004 RPC-STREAM-005 releases handler capacity when canceled source teardown throws", async () => {
		const pair = await createPair(
			{},
			{
				runtimePolicy: { maxHandlersPerSession: 1 },
				interceptor: (_context, next) => next(),
			},
		);
		const handler = vi.fn((seed: number) =>
			seed === 1
				? new Observable<number>((subscriber) => {
						subscriber.next(seed);
						return () => {
							throw new Error("private teardown failure");
						};
					})
				: of(seed),
		);
		pair.acceptor.expose(descriptor, {
			values: handler,
			changes: new Subject<number>(),
		});
		const values: number[] = [];
		const subscription = pair.remote
			.values(1)
			.subscribe((value) => values.push(value));
		await vi.waitFor(() => expect(values).toEqual([1]));
		subscription.unsubscribe();
		await expect(lastValueFrom(pair.remote.values(2))).resolves.toBe(2);
		expect(pair.connector.peer.state.status).toBe("connected");
	});

	it("RPC-STREAM-003 RPC-SPI-003 faults malformed stream preparation and throwing controls without publishing payloads", async () => {
		const preparations: Array<
			NonNullable<IRpcProtocolSession["prepareStream"]>
		> = [
			() => {
				throw new Error("broken preparation");
			},
			() => ({ start: 7, cancel() {} }) as never,
			(_request, observer) => {
				observer.complete();
				return undefined;
			},
			(_request, observer) => {
				observer.complete();
				observer.complete();
				return { start() {}, cancel() {} };
			},
			() => ({
				start() {
					throw new Error("broken start");
				},
				cancel() {},
			}),
		];
		for (const prepareStream of preparations) {
			const forceClose = vi.fn();
			const { connector } = await connectProtocolSession({
				prepareStream,
				prepareInvocation: () => undefined,
				forceClose,
			});
			onTestFinished(() => connector.close());
			await expect(
				lastValueFrom(connector.peer.resolve(descriptor).values(1)),
			).rejects.toMatchObject({ code: "protocol" });
			expect(forceClose).toHaveBeenCalledTimes(1);
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				reason: "protocol-fault",
			});
		}
	});
});
