/**
 * @overview Verifies call interception, metadata isolation, cancellation, and Recovery.
 * @author AEPKILL
 * @created 2026-09-12 02:38:04
 */

import { createServiceIdentifier } from "@husky-di/core";
import {
	catchError,
	finalize,
	from,
	map,
	type Observable,
	of,
	switchMap,
	throwError,
} from "rxjs";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcApplicationRecord,
	type RpcCallContext,
	RpcCallDirectionEnum,
	type RpcInterceptor,
} from "../../src/index";
import {
	createInterceptedPair,
	interceptedCalculatorDescriptor as descriptor,
} from "./test.utils";

describe("Framework call interception", () => {
	it("RPC-INTERCEPT-001 validates and snapshots interceptor configuration without executing it at construction", async () => {
		for (const createOwner of [createRpcConnector, createRpcAcceptor]) {
			expect(() => createOwner({ interceptor: null as never })).toThrow(
				TypeError,
			);
			expect(() => createOwner({ interceptor: 7 as never })).toThrow(TypeError);
			expect(() =>
				createOwner({ callInterceptor: () => of(1) } as never),
			).toThrow(TypeError);
			expect(() =>
				createOwner({
					interceptor: () => of(1),
					callInterceptor: () => of(2),
				} as never),
			).toThrow(TypeError);
		}
		const interceptor = vi.fn<RpcInterceptor>((_context, next) => next());
		const options = { interceptor: interceptor as RpcInterceptor };
		const pair = await createInterceptedPair(options, options);
		expect(interceptor).not.toHaveBeenCalled();
		options.interceptor = () => of(19);
		await expect(pair.remote.add(1, 2)).resolves.toBe(3);
		expect(interceptor).toHaveBeenCalledTimes(2);
	});

	it("RPC-INTERCEPT-001 RPC-INTERCEPT-006 propagates isolated metadata in both directions without changing arguments or events", async () => {
		const contexts: RpcCallContext[] = [];
		let sequence = 0;
		const interceptor: RpcInterceptor = (context, next) => {
			contexts.push(context);
			if (context.direction === RpcCallDirectionEnum.outgoing) {
				expect(context.metadata).toEqual({});
				context.metadata = {
					traceId: `trace-${++sequence}`,
					nested: { span: [1] },
				};
			} else {
				expect(Object.isFrozen(context.metadata)).toBe(true);
				expect(Object.isFrozen(context.metadata.nested)).toBe(true);
				const nested = context.metadata.nested as IRpcApplicationRecord;
				expect(Object.isFrozen(nested.span)).toBe(true);
				expect(context.signal).toBeInstanceOf(AbortSignal);
			}
			return next();
		};
		const pair = await createInterceptedPair(
			{ interceptor: interceptor },
			{ interceptor: interceptor },
		);
		await expect(
			Promise.all([pair.remote.add(1, 2), pair.remote.add(3, 4)]),
		).resolves.toEqual([3, 7]);
		const reversePeer = pair.acceptor.peers[0];
		if (reversePeer === undefined)
			throw new Error("Expected an accepted Peer.");
		await expect(reversePeer.resolve(descriptor).add(5, 6)).resolves.toBe(11);

		const incoming = contexts.filter(
			(context) => context.direction === RpcCallDirectionEnum.incoming,
		);
		const outgoing = contexts.filter(
			(context) => context.direction === RpcCallDirectionEnum.outgoing,
		);
		expect(incoming.map((context) => context.metadata.traceId)).toEqual([
			"trace-1",
			"trace-2",
			"trace-3",
		]);
		expect(new Set(contexts).size).toBe(6);
		expect(outgoing[0]?.metadata).not.toBe(incoming[0]?.metadata);
		expect(outgoing[0]?.peer).toBe(pair.connector.peer);
		expect(incoming[0]?.peer).toBe(reversePeer);
		expect(outgoing[2]?.peer).toBe(reversePeer);
		expect(incoming[2]?.peer).toBe(pair.connector.peer);
		for (const context of contexts) {
			expect(context.service).toBe("example.intercepted-calculator.v1");
			expect(context.method).toBe("add");
		}
		expect(pair.handler.mock.calls).toEqual([
			[1, 2],
			[3, 4],
			[5, 6],
		]);
		for (const event of pair.events)
			expect(event).not.toHaveProperty("metadata");
	});

	it("RPC-INTERCEPT-002 RPC-INTERCEPT-006 snapshots arguments before asynchronous interception and metadata when next starts", async () => {
		const gate = Promise.withResolvers<void>();
		onTestFinished(() => gate.resolve());
		const metadata = { traceId: "original", nested: { span: [1] } };
		const received: IRpcApplicationRecord[] = [];
		const pair = await createInterceptedPair(
			{
				interceptor: (context, next) => {
					if (context.direction !== RpcCallDirectionEnum.outgoing)
						return next();
					return from(gate.promise).pipe(
						switchMap(() => {
							context.metadata = metadata;
							const result = next();
							metadata.traceId = "changed";
							metadata.nested.span[0] = 2;
							return result;
						}),
					);
				},
			},
			{
				interceptor: (context, next) => {
					received.push(context.metadata);
					return next();
				},
			},
		);
		const recordDescriptor = createRemoteServiceDescriptor(
			createServiceIdentifier<{ read(value: { value: number }): number }>(
				"IInterceptedRecordService",
			),
			{
				wireName: "example.intercepted-record.v1",
				members: { read: { kind: "function" } },
			},
		);
		pair.acceptor.expose(recordDescriptor, { read: (value) => value.value });
		const input = { value: 7 };
		const result = pair.connector.peer.resolve(recordDescriptor).read(input);
		input.value = 9;
		gate.resolve();
		await expect(result).resolves.toBe(7);
		expect(received).toEqual([{ traceId: "original", nested: { span: [1] } }]);
		expect(pair.calls()[0]?.metadata).toEqual(received[0]);
	});

	it("RPC-INTERCEPT-003 wraps results and errors and permits short circuits in either direction", async () => {
		const pair = await createInterceptedPair(
			{
				interceptor: (_context, next) =>
					next().pipe(map((value) => Number(value) + 10)),
			},
			{
				interceptor: (_context, next) =>
					next().pipe(map((value) => Number(value) + 100)),
			},
		);
		await expect(pair.remote.add(1, 2)).resolves.toBe(113);
		expect(pair.handler).toHaveBeenCalledTimes(1);
		const recovered = await createInterceptedPair(
			{},
			{
				interceptor: (_context, next) => next().pipe(catchError(() => of(19))),
			},
		);
		recovered.handler.mockImplementation(() => {
			throw new Error("handler failure");
		});
		await expect(recovered.remote.add(1, 2)).resolves.toBe(19);
		const outgoing = await createInterceptedPair({ interceptor: () => of(7) });
		await expect(outgoing.remote.add(1, 2)).resolves.toBe(7);
		expect(outgoing.calls()).toHaveLength(0);
		expect(outgoing.handler).not.toHaveBeenCalled();
		const incoming = await createInterceptedPair(
			{},
			{ interceptor: () => of(9) },
		);
		await expect(incoming.remote.add(1, 2)).resolves.toBe(9);
		expect(incoming.calls()).toHaveLength(1);
		expect(incoming.handler).not.toHaveBeenCalled();
	});

	it("RPC-INTERCEPT-003 RPC-INTERCEPT-004 preserves local interceptor failures and sanitizes incoming failures", async () => {
		const failure = new Error("private interceptor failure");
		const outgoing = await createInterceptedPair({
			interceptor: () => {
				throw failure;
			},
		});
		await expect(outgoing.remote.add(1, 2)).rejects.toBe(failure);
		expect(outgoing.calls()).toHaveLength(0);
		const incoming = await createInterceptedPair(
			{},
			{
				interceptor: () => throwError(() => failure),
			},
		);
		await expect(incoming.remote.add(1, 2)).rejects.toMatchObject({
			code: "handler-failed",
			cause: undefined,
		});
		expect(incoming.handler).not.toHaveBeenCalled();
		expect(incoming.connector.peer.state.status).toBe("connected");
	});

	it("RPC-INTERCEPT-003 rejects repeated and late next calls without repeating invocation or handler execution", async () => {
		for (const direction of [
			RpcCallDirectionEnum.outgoing,
			RpcCallDirectionEnum.incoming,
		]) {
			let retainedNext: (() => Observable<unknown>) | undefined;
			const interceptor: RpcInterceptor = (_context, next) => {
				retainedNext = next;
				const result = next();
				expect(() => next()).toThrow(TypeError);
				return result;
			};
			const pair = await createInterceptedPair(
				direction === RpcCallDirectionEnum.outgoing
					? { interceptor: interceptor }
					: {},
				direction === RpcCallDirectionEnum.incoming
					? { interceptor: interceptor }
					: {},
			);
			await expect(pair.remote.add(1, 2)).resolves.toBe(3);
			if (retainedNext === undefined)
				throw new Error("Expected an interceptor continuation.");
			expect(retainedNext).toThrow(TypeError);
			expect(pair.calls()).toHaveLength(1);
			expect(pair.handler).toHaveBeenCalledTimes(1);
		}
		let unusedNext: (() => Observable<unknown>) | undefined;
		const pair = await createInterceptedPair({
			interceptor: (_context, next) => {
				unusedNext = next;
				return of(5);
			},
		});
		await expect(pair.remote.add(1, 2)).resolves.toBe(5);
		if (unusedNext === undefined)
			throw new Error("Expected a retained unused continuation.");
		expect(unusedNext).toThrow(TypeError);
		expect(pair.calls()).toHaveLength(0);
	});

	it("RPC-INTERCEPT-002 rechecks cancellation and close when suspended outgoing interception continues", async () => {
		for (const cancel of [true, false]) {
			const gate = Promise.withResolvers<void>();
			const entered = Promise.withResolvers<void>();
			const finished = Promise.withResolvers<void>();
			onTestFinished(() => gate.resolve());
			const pair = await createInterceptedPair({
				interceptor: (_context, next) => {
					entered.resolve();
					return from(gate.promise).pipe(
						switchMap(() => next()),
						finalize(() => finished.resolve()),
					);
				},
			});
			const controller = new AbortController();
			const result = pair.remote.cancel("value", controller.signal);
			const rejected = expect(result).rejects.toMatchObject({
				code: cancel ? "canceled" : "unavailable",
			});
			await entered.promise;
			if (cancel) controller.abort();
			else await pair.connector.close();
			gate.resolve();
			await rejected;
			await finished.promise;
			expect(pair.calls()).toHaveLength(0);
			expect(pair.cancelHandler).not.toHaveBeenCalled();
		}
	});

	it("RPC-INTERCEPT-004 retains the handler permit when an interceptor returns before its started handler settles", async () => {
		const deferred = Promise.withResolvers<number>();
		onTestFinished(() => deferred.resolve(3));
		let interceptions = 0;
		const pair = await createInterceptedPair(
			{},
			{
				runtimePolicy: { maxHandlersPerSession: 1 },
				interceptor: (_context, next) => {
					interceptions += 1;
					next().subscribe({ error() {} });
					return of(17);
				},
			},
		);
		pair.handler.mockImplementation(() => deferred.promise as never);
		await expect(pair.remote.add(1, 2)).resolves.toBe(17);
		const queued = pair.remote.add(3, 4);
		await vi.waitFor(() => expect(pair.calls()).toHaveLength(2));
		expect(interceptions).toBe(1);
		expect(pair.handler).toHaveBeenCalledTimes(1);
		deferred.resolve(3);
		await expect(queued).resolves.toBe(17);
		expect(interceptions).toBe(2);
		expect(pair.handler).toHaveBeenCalledTimes(2);
	});

	it("RPC-INTERCEPT-004 holds the handler permit through interception and skips canceled queued or delayed handlers", async () => {
		const gate = Promise.withResolvers<void>();
		onTestFinished(() => gate.resolve());
		const contexts: RpcCallContext[] = [];
		const pair = await createInterceptedPair(
			{},
			{
				runtimePolicy: { maxHandlersPerSession: 1 },
				interceptor: (context, next) => {
					contexts.push(context);
					return from(gate.promise).pipe(switchMap(() => next()));
				},
			},
		);
		const firstController = new AbortController();
		const queuedController = new AbortController();
		const first = pair.remote.cancel("first", firstController.signal);
		const firstRejected = expect(first).rejects.toMatchObject({
			code: "canceled",
		});
		await vi.waitFor(() => expect(contexts).toHaveLength(1));
		const queued = pair.remote.cancel("queued", queuedController.signal);
		const queuedRejected = expect(queued).rejects.toMatchObject({
			code: "canceled",
		});
		const final = pair.remote.add(1, 2);
		await vi.waitFor(() => expect(pair.calls()).toHaveLength(3));
		queuedController.abort();
		firstController.abort();
		await Promise.all([firstRejected, queuedRejected]);
		await vi.waitFor(() => expect(contexts[0]?.signal?.aborted).toBe(true));
		expect(contexts).toHaveLength(1);
		expect(pair.handler).not.toHaveBeenCalled();
		gate.resolve();
		await expect(final).resolves.toBe(3);
		expect(contexts.map((context) => context.method)).toEqual([
			"cancel",
			"add",
		]);
		expect(pair.cancelHandler).not.toHaveBeenCalled();
		expect(pair.handler).toHaveBeenCalledTimes(1);
	});

	it("RPC-INTERCEPT-002 RPC-INTERCEPT-005 omits unused metadata and rejects invalid or canceled metadata before wire admission", async () => {
		const plain = await createInterceptedPair();
		await expect(plain.remote.add(1, 2)).resolves.toBe(3);
		expect(plain.calls()[0]).not.toHaveProperty("metadata");
		const untouched = await createInterceptedPair({
			interceptor: (_context, next) => next(),
		});
		await expect(untouched.remote.add(1, 2)).resolves.toBe(3);
		expect(untouched.calls()[0]).not.toHaveProperty("metadata");
		let getterCalls = 0;
		const invalid = await createInterceptedPair({
			interceptor: (context, next) => {
				if (context.direction === RpcCallDirectionEnum.outgoing) {
					context.metadata = Object.defineProperty({}, "traceId", {
						enumerable: true,
						get() {
							getterCalls += 1;
							return "trace";
						},
					});
				}
				return next();
			},
		});
		await expect(invalid.remote.add(1, 2)).rejects.toBeInstanceOf(TypeError);
		expect(getterCalls).toBe(0);
		expect(invalid.calls()).toHaveLength(0);
		expect(invalid.handler).not.toHaveBeenCalled();
		const controller = new AbortController();
		const canceled = await createInterceptedPair({
			interceptor: (context, next) => {
				if (context.direction === RpcCallDirectionEnum.outgoing) {
					context.metadata = new Proxy(
						{},
						{
							ownKeys() {
								controller.abort();
								return [];
							},
						},
					);
				}
				return next();
			},
		});
		await expect(
			canceled.remote.cancel("value", controller.signal),
		).rejects.toMatchObject({ code: "canceled" });
		expect(canceled.calls()).toHaveLength(0);
		expect(
			canceled.events.filter((event) => event.type.startsWith("call-")),
		).toEqual([]);
	});

	it("RPC-INTERCEPT-005 RPC-INTERCEPT-006 replays the original metadata after Recovery without rerunning interception", async () => {
		let outgoingCalls = 0;
		let incomingCalls = 0;
		const metadata = { traceId: "original" };
		const pair = await createInterceptedPair(
			{
				interceptor: (context, next) => {
					if (context.direction === RpcCallDirectionEnum.outgoing) {
						outgoingCalls += 1;
						context.metadata = metadata;
					}
					return next();
				},
			},
			{
				interceptor: (context, next) => {
					incomingCalls += 1;
					expect(context.metadata).toEqual({ traceId: "original" });
					return next();
				},
			},
		);
		pair.network.setInterceptor((record) => {
			if (record.connectionId === 1 && record.direction === "connector")
				return { drop: true };
			return undefined;
		});
		const result = pair.remote.add(1, 2);
		void result.catch(() => {});
		await vi.waitFor(() => expect(pair.calls()).toHaveLength(1));
		metadata.traceId = "changed";
		pair.network.disconnect(1);
		await pair.connector.connect({
			adapter: pair.network.createConnectorAdapter(),
		});
		await expect(result).resolves.toBe(3);
		expect(pair.calls()).toHaveLength(2);
		expect(pair.calls().map((message) => message.metadata)).toEqual([
			{ traceId: "original" },
			{ traceId: "original" },
		]);
		expect(outgoingCalls).toBe(1);
		expect(incomingCalls).toBe(1);
		expect(pair.handler).toHaveBeenCalledTimes(1);
	});
});
