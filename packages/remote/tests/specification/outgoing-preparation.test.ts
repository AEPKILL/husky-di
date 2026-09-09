/**
 * @overview Verifies outgoing preparation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	RpcEventTypeEnum,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type { IRpcProtocolSession, RpcCallOutcome } from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import { connectProtocolSession, ICalculatorService } from "./test.utils";

describe("custom Protocol outgoing invocations", () => {
	it("RPC-SPI-003 RPC-SPI-004 faults duplicate finish, thrown preparation, and malformed prepared controls", async () => {
		let duplicateForceCalls = 0;
		const duplicateSession: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
				finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
				return { start() {}, cancel() {} };
			},
			forceClose() {
				duplicateForceCalls += 1;
			},
		};
		const duplicate = await connectProtocolSession(duplicateSession);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.invalid-prepare.v1",
			methods: { add: true },
		});
		await expect(
			Promise.resolve().then(() =>
				duplicate.connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({ code: "protocol" });
		expect(duplicateForceCalls).toBe(1);
		await duplicate.connector.close();

		const preparationFailure = new Error("preparation failure");
		let throwingForceCalls = 0;
		const throwingSession: IRpcProtocolSession = {
			prepareInvocation() {
				throw preparationFailure;
			},
			forceClose() {
				throwingForceCalls += 1;
			},
		};
		const throwing = await connectProtocolSession(throwingSession);
		await expect(
			Promise.resolve().then(() =>
				throwing.connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({
			code: RpcExceptionCodeEnum.protocol,
			cause: preparationFailure,
		});
		expect(throwingForceCalls).toBe(1);
		await throwing.connector.close();

		let malformedForceCalls = 0;
		const malformedSession: IRpcProtocolSession = {
			prepareInvocation: () => ({ start() {} }) as never,
			forceClose() {
				malformedForceCalls += 1;
			},
		};
		const malformed = await connectProtocolSession(malformedSession);
		await expect(
			Promise.resolve().then(() =>
				malformed.connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({ code: "protocol" });
		expect(malformedForceCalls).toBe(1);
		await malformed.connector.close();

		const getterFailure = new Error("prepared control getter failure");
		let getterForceCalls = 0;
		const throwingControl = Object.defineProperty({ cancel() {} }, "start", {
			get() {
				throw getterFailure;
			},
		});
		const getterSession: IRpcProtocolSession = {
			prepareInvocation: () => throwingControl as never,
			forceClose() {
				getterForceCalls += 1;
			},
		};
		const getter = await connectProtocolSession(getterSession);
		await expect(
			Promise.resolve().then(() =>
				getter.connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({
			code: RpcExceptionCodeEnum.protocol,
			cause: getterFailure,
		});
		expect(getterForceCalls).toBe(1);
		await getter.connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-004 faults a validation-time duplicate before call-start publication", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let forceCalls = 0;
		let startCalls = 0;
		const control = Object.defineProperty({ cancel() {} }, "start", {
			get() {
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
				return () => {
					startCalls += 1;
				};
			},
		});
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return control as never;
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
			},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.validation-reentrancy.v1",
			methods: { add: true },
		});

		await expect(
			Promise.resolve().then(() =>
				connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({ code: RpcExceptionCodeEnum.protocol });
		expect({ forceCalls, startCalls }).toEqual({
			forceCalls: 1,
			startCalls: 0,
		});
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-SPI-004 lets reentrant abort cancel a prepared call before start", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let startCalls = 0;
		let cancelCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return {
					start() {
						startCalls += 1;
					},
					cancel() {
						cancelCalls += 1;
						finishInvocation?.({
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.canceled,
						});
					},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.reentrant-abort.v1",
			methods: { cancel: { cancelable: true } },
		});
		const controller = new AbortController();
		const subscription = connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.callStarted) {
				controller.abort();
			}
		});

		await expect(
			connector.peer.resolve(descriptor).cancel("value", controller.signal),
		).rejects.toMatchObject({ code: "canceled" });
		expect({ startCalls, cancelCalls }).toEqual({
			startCalls: 0,
			cancelCalls: 1,
		});
		subscription.unsubscribe();
		await connector.close();
	});
});
