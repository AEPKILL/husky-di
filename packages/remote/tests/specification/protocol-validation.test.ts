/**
 * @overview Verifies protocol validation.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type {
	IRpcProtocolSession,
	IRpcProtocolStreamObserver,
	RpcCallOutcome,
} from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import {
	connectProtocolSession,
	consumeIncomingCall,
	ICalculatorService,
	IDeferredService,
} from "./test.utils";

describe("custom Protocol incoming calls", () => {
	it("RPC-STREAM-003 RPC-SPI-003 rejects forged outgoing stream snapshots without reading their values", async () => {
		let observer: IRpcProtocolStreamObserver | undefined;
		let forceCalls = 0;
		let reads = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			prepareStream(_request, streamObserver) {
				observer = streamObserver;
				return { start() {}, cancel() {} };
			},
			forceClose() {
				forceCalls += 1;
				observer?.error(RpcExceptionCodeEnum.outcomeUnknown);
			},
		};
		const { connector } = await connectProtocolSession(session);
		const identifier = createServiceIdentifier<{ watch(): Observable<number> }>(
			"IForgedStreamService",
		);
		const descriptor = createRemoteServiceDescriptor(identifier, {
			wireName: "example.forged-stream.v2",
			members: { watch: { kind: "observable-function" } },
		});
		const values: unknown[] = [];
		const errors: unknown[] = [];
		const subscription = connector.peer
			.resolve(descriptor)
			.watch()
			.subscribe({
				next: (value) => values.push(value),
				error: (error) => errors.push(error),
			});
		observer?.next(
			Object.defineProperty({ weight: 2 }, "value", {
				get() {
					reads += 1;
					return 41;
				},
			}) as never,
		);
		expect(reads).toBe(0);
		expect(values).toEqual([]);
		expect(errors).toMatchObject([{ code: "outcome-unknown" }]);
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			reason: "protocol-fault",
		});
		subscription.unsubscribe();
		await connector.close();
	});

	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-005 rejects forged snapshots passed to semantic equality", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host } = await connectProtocolSession(session);
		const canonical = host.normalizeApplicationValue({ value: 1 });

		expect(
			host.applicationValuesEqual(canonical, {
				value: { value: 1 },
				weight: canonical.weight,
			} as never),
		).toBe(false);
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-005 rejects a forged outgoing Application snapshot", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return { start() {}, cancel() {} };
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "function" } },
		});
		const result = connector.peer.resolve(descriptor).add(20, 21);

		finishInvocation?.({
			type: RpcCallTerminalTypeEnum.returned,
			value: { value: 41, weight: 2 } as never,
		});

		await expect(result).rejects.toMatchObject({ code: "outcome-unknown" });
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-003 rejects extra own fields in an outgoing terminal", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return { start() {}, cancel() {} };
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "function" } },
		});
		const result = connector.peer.resolve(descriptor).add(20, 21);
		const terminal = Object.assign(Object.create(null), {
			type: RpcCallTerminalTypeEnum.returnedVoid,
		}) as Record<string, unknown>;
		terminal.__proto__ = 0;

		finishInvocation?.(terminal as never);

		await expect(result).rejects.toMatchObject({ code: "outcome-unknown" });
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-006 rejects a mismatched unknown-call terminal", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const reserved = consumeIncomingCall(sessionHost, {
			service: "unknown.service",
			method: "unknownMethod",
			args: host.normalizeApplicationArguments([]),
		});
		if (reserved?.kind !== "unknown") {
			throw new Error("Expected an unknown-call reservation.");
		}
		const call = reserved.call;

		call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		});

		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-006 rejects an impossible handler terminal", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			members: { run: { kind: "function" } },
		});
		connector.peer.expose(descriptor, {
			run: () => new Promise<number>(() => {}),
		});
		const reserved = consumeIncomingCall(sessionHost, {
			service: "example.deferred.v1",
			method: "run",
			args: host.normalizeApplicationArguments([1]),
		});
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a handler reservation.");
		}
		const call = reserved.call;

		call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
		});

		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-006 rejects forged incoming arguments before lookup", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, sessionHost, events } =
			await connectProtocolSession(session);

		expect(() =>
			sessionHost.reserveIncomingCall(
				{
					service: "attacker.service",
					method: "attackerMethod",
					args: { value: [], weight: 2 } as never,
				},
				() => undefined,
			),
		).toThrow("invalid incoming call request");
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-INTERCEPT-005 RPC-SPI-003 RPC-SPI-006 rejects forged or non-record incoming metadata before lookup", async () => {
		for (const value of [undefined, [], "trace", null]) {
			let forceCalls = 0;
			let consumeCalls = 0;
			const session: IRpcProtocolSession = {
				prepareInvocation: () => undefined,
				forceClose() {
					forceCalls += 1;
				},
			};
			const { connector, host, sessionHost, events } =
				await connectProtocolSession(session);
			const metadata =
				value === undefined
					? Object.freeze({
							value: Object.freeze({ traceId: "forged" }),
							weight: 20,
						})
					: host.normalizeApplicationValue(value);
			expect(() =>
				sessionHost.reserveIncomingCall(
					{
						service: "attacker.service",
						method: "attackerMethod",
						args: host.normalizeApplicationArguments([]),
						metadata: metadata as never,
					},
					() => {
						consumeCalls += 1;
						return undefined;
					},
				),
			).toThrow("invalid incoming call request");
			expect(consumeCalls).toBe(0);
			expect(forceCalls).toBe(1);
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "protocol-fault",
			});
			expect(
				events.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				),
			).toEqual([]);
			await connector.close();
		}
	});

	it("RPC-SPI-003 RPC-SPI-006 rejects extra own fields before incoming lookup", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const request = Object.assign(Object.create(null), {
			service: "attacker.service",
			method: "attackerMethod",
			args: host.normalizeApplicationArguments([]),
		}) as Record<string, unknown>;
		request.__proto__ = 0;

		expect(() =>
			sessionHost.reserveIncomingCall(request as never, () => undefined),
		).toThrow("invalid incoming call request");
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it.each([
		[
			"a synchronous handler throw",
			() => {
				throw new Error("application handler threw");
			},
		],
		[
			"a throwing then getter",
			() => {
				const result = Promise.resolve(1);
				// biome-ignore lint/suspicious/noThenProperty: Exercises hostile application thenable assimilation.
				Object.defineProperty(result, "then", {
					configurable: true,
					get() {
						throw new Error("application then getter failed");
					},
				});
				return result;
			},
		],
		[
			"a rejected handler Promise",
			() => Promise.reject(new Error("application handler rejected")),
		],
		["a normalization failure", () => Promise.resolve(new Map())],
	] as const)("RPC-CALL-007 RPC-CALL-008 maps %s to a consumed handler failure", async (_case, createResult) => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.handler-failure.v1",
			members: { run: { kind: "function" } },
		});
		connector.peer.expose(descriptor, {
			run: () => createResult() as Promise<number>,
		});
		const reserved = consumeIncomingCall(sessionHost, {
			service: "example.handler-failure.v1",
			method: "run",
			args: host.normalizeApplicationArguments([1]),
		});
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a known handler reservation.");
		}
		const call = reserved.call;

		await expect(call.handlerOutcome).resolves.toEqual({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		await connector.close();
	});
});
