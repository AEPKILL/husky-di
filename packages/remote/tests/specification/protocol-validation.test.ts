/**
 * @overview Verifies protocol validation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type { IRpcProtocolSession, RpcCallOutcome } from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import {
	connectProtocolSession,
	consumeIncomingCall,
	ICalculatorService,
	IDeferredService,
} from "./test.utils";

describe("custom Protocol incoming calls", () => {
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
			methods: { add: true },
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
			methods: { add: true },
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
			methods: { run: true },
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
			methods: { run: true },
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
