/**
 * @overview Verifies incoming dispatch.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type { IRpcProtocolSession } from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import {
	connectProtocolSession,
	consumeIncomingCall,
	ICalculatorService,
	IDeferredService,
} from "./test.utils";

describe("custom Protocol incoming calls", () => {
	it("RPC-SPI-006 RPC-SPI-007 RPC-EVENT-001 RPC-EVENT-002 RPC-EVENT-003 captures a known route, defers dispatch, and publishes a paired observation", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		let handlerCalls = 0;
		const implementation = {
			base: 10,
			add(this: { base: number }, left: number, right: number) {
				handlerCalls += 1;
				return this.base + left + right;
			},
		};
		connector.peer.expose(descriptor, implementation);

		const reserved = consumeIncomingCall(sessionHost, {
			service: "example.calculator.v1",
			method: "add",
			args: host.normalizeApplicationArguments([2, 3]),
		});
		expect(reserved?.kind).toBe("handler");
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a known handler reservation.");
		}
		const call = reserved.call;
		expect(handlerCalls).toBe(0);
		const handlerOutcome = await call.handlerOutcome;
		expect(handlerCalls).toBe(1);
		expect(handlerOutcome).toMatchObject({
			type: "returned",
			value: { value: 15 },
		});
		if (handlerOutcome.type !== "returned") {
			throw new Error("Expected a returned handler value.");
		}
		call.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: handlerOutcome.value,
		});

		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toMatchObject([
			{
				type: "call-started",
				direction: "incoming",
				service: "example.calculator.v1",
				method: "add",
			},
			{
				type: "call-finished",
				direction: "incoming",
				service: "example.calculator.v1",
				method: "add",
				outcome: "fulfilled",
			},
		]);
	});

	it("RPC-SPI-006 RPC-SPI-007 RPC-EVENT-001 RPC-EVENT-002 RPC-EVENT-003 emits safe correlated unknown-service and unknown-method pairs", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		connector.peer.expose(descriptor, { add: (left, right) => left + right });
		const args = host.normalizeApplicationArguments([]);

		const unknownService = consumeIncomingCall(sessionHost, {
			service: "attacker.supplied.service",
			method: "attackerMethod",
			args,
		});
		expect(unknownService).toMatchObject({
			kind: "unknown",
			code: "unknown-service",
		});
		if (unknownService?.kind !== "unknown") {
			throw new Error("Expected unknown-service reservation.");
		}
		unknownService.call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
		});

		const unknownMethod = consumeIncomingCall(sessionHost, {
			service: "example.calculator.v1",
			method: "attackerMethod",
			args,
		});
		expect(unknownMethod).toMatchObject({
			kind: "unknown",
			code: "unknown-method",
		});
		if (unknownMethod?.kind !== "unknown") {
			throw new Error("Expected unknown-method reservation.");
		}
		unknownMethod.call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		});

		const observations = events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(observations).toHaveLength(4);
		expect(observations[0]).toMatchObject({ direction: "incoming" });
		expect(observations[0]).not.toHaveProperty("service");
		expect(observations[0]).not.toHaveProperty("method");
		expect(observations[1]).toMatchObject({ code: "unknown-service" });
		expect(observations[2]).toMatchObject({
			direction: "incoming",
			service: "example.calculator.v1",
		});
		expect(observations[2]).not.toHaveProperty("method");
		expect(observations[3]).toMatchObject({ code: "unknown-method" });
		expect(connector.peer.state).toEqual({ status: "connected" });
		await connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-007 enforces exact-once incoming finish", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const reserved = consumeIncomingCall(sessionHost, {
			service: "unknown.finish-once",
			method: "missing",
			args: host.normalizeApplicationArguments([]),
		});
		if (reserved?.kind !== "unknown") {
			throw new Error("Expected an unknown-call reservation.");
		}
		const terminal = {
			type: RpcCallTerminalTypeEnum.failed,
			code: reserved.code,
		} as const;

		reserved.call.finish(terminal);
		reserved.call.finish(terminal);

		expect(forceCalls).toBe(1);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toHaveLength(2);
		await connector.close();
	});

	it("RPC-CALL-008 holds the Session and Owner permits until real handler settlement", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } = await connectProtocolSession(
			session,
			{ maxHandlersPerSession: 1 },
		);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			methods: { run: true },
		});
		const handlerResolvers: ((value: number) => void)[] = [];
		let handlerCalls = 0;
		connector.peer.expose(descriptor, {
			run(value) {
				handlerCalls += 1;
				return new Promise<number>((resolve) => {
					handlerResolvers.push(() => resolve(value));
				});
			},
		});

		const reserve = (value: number) => {
			const reservation = consumeIncomingCall(sessionHost, {
				service: "example.deferred.v1",
				method: "run",
				args: host.normalizeApplicationArguments([value]),
			});
			if (reservation?.kind !== "handler") {
				throw new Error("Expected a handler reservation.");
			}
			return reservation.call;
		};
		const first = reserve(3);
		const second = reserve(7);
		await Promise.resolve();
		expect(handlerCalls).toBe(1);

		handlerResolvers[0]?.(3);
		const firstOutcome = await first.handlerOutcome;
		if (firstOutcome.type !== "returned") {
			throw new Error("Expected the first handler result.");
		}
		first.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: firstOutcome.value,
		});
		await expect.poll(() => handlerCalls).toBe(2);

		handlerResolvers[1]?.(7);
		const secondOutcome = await second.handlerOutcome;
		if (secondOutcome.type !== "returned") {
			throw new Error("Expected the second handler result.");
		}
		second.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: secondOutcome.value,
		});
	});

	it("RPC-SPI-006 RPC-RESOURCE-001 rejects incoming work before route lookup when the args subcap is reserved", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { host, sessionHost, events } = await connectProtocolSession(
			session,
			{
				maxRetainedBytesPerSession: 4 * 1024 * 1024,
			},
		);
		const args = host.normalizeApplicationArguments([
			"a".repeat(500_000),
			"b".repeat(499_993),
		]);
		expect(args.weight).toBe(1_000_000);

		const request = {
			service: "unknown.service",
			method: "unknownMethod",
			args,
		};
		const first = consumeIncomingCall(sessionHost, request);
		expect(first?.kind).toBe("unknown");
		let secondConsumeCalls = 0;
		expect(
			sessionHost.reserveIncomingCall(request, () => {
				secondConsumeCalls += 1;
				return undefined;
			}),
		).toBe(false);
		expect(secondConsumeCalls).toBe(0);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([expect.objectContaining({ type: "call-started" })]);

		if (first?.kind !== "unknown") {
			throw new Error("Expected the first unknown-call reservation.");
		}
		first.call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: first.code,
		});
		const afterRelease = consumeIncomingCall(sessionHost, request);
		expect(afterRelease?.kind).toBe("unknown");
		if (afterRelease?.kind === "unknown") {
			afterRelease.call.finish({
				type: RpcCallTerminalTypeEnum.failed,
				code: afterRelease.code,
			});
		}
	});

	it("RPC-CLOSE-001 consumes a terminal handler result without normalizing it", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			methods: { run: true },
		});
		let resolveHandler!: (value: number) => void;
		let inspectionCalls = 0;
		connector.peer.expose(descriptor, {
			run() {
				return new Promise<number>((resolve) => {
					resolveHandler = resolve;
				});
			},
		});
		const reserved = consumeIncomingCall(sessionHost, {
			service: "example.deferred.v1",
			method: "run",
			args: host.normalizeApplicationArguments([1]),
		});
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a known handler reservation.");
		}
		const call = reserved.call;
		await Promise.resolve();
		call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });

		resolveHandler(
			new Proxy(
				{},
				{
					getPrototypeOf() {
						inspectionCalls += 1;
						return Object.prototype;
					},
				},
			) as never,
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(inspectionCalls).toBe(0);
		await connector.close();
	});
});
