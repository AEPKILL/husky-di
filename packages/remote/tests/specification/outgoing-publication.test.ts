/**
 * @overview Verifies outgoing publication.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	RpcCallStatusEnum,
	RpcEventTypeEnum,
	RpcExceptionCodeEnum,
} from "../../src/index";
import type { IRpcProtocolSession, RpcCallOutcome } from "../../src/protocol";
import { RpcCallTerminalTypeEnum } from "../../src/protocol";
import { connectProtocolSession, ICalculatorService } from "./test.utils";

describe("custom Protocol outgoing invocations", () => {
	it("RPC-SPI-004 faults a late finish after definite non-execution without recursion", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return undefined;
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
			},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.late-dne.v1",
			methods: { add: true },
		});

		await expect(
			connector.peer.resolve(descriptor).add(1, 2),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(forceCalls).toBe(0);
		finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
		expect(forceCalls).toBe(1);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-SPI-004 RPC-SPI-005 gates synchronous finish until preparation and call-start publication", async () => {
		let startCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
				return {
					start() {
						startCalls += 1;
					},
					cancel() {},
				};
			},
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.sync-finish.v1",
			methods: { add: true },
		});

		await expect(connector.peer.resolve(descriptor).add(1, 2)).resolves.toBe(
			undefined,
		);
		expect(startCalls).toBe(0);
		expect(
			events
				.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				)
				.map((event) => event.type),
		).toEqual(["call-started", "call-finished"]);
		await connector.close();
	});

	it("RPC-SPI-004 RPC-SPI-005 preserves the first terminal before faulting a publication-time duplicate", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let startCalls = 0;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return {
					start() {
						startCalls += 1;
					},
					cancel() {},
				};
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.reentrant-duplicate.v1",
			methods: { add: true },
		});
		const subscription = connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.callStarted) {
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
				finishInvocation?.({ type: RpcCallTerminalTypeEnum.returnedVoid });
			}
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
			events
				.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				)
				.map((event) =>
					event.type === RpcEventTypeEnum.callFinished
						? [event.type, event.outcome]
						: [event.type],
				),
		).toEqual([
			[RpcEventTypeEnum.callStarted],
			[RpcEventTypeEnum.callFinished, "fulfilled"],
		]);
		subscription.unsubscribe();
		await connector.close();
	});

	it("RPC-SPI-004 RPC-SPI-005 terminalizes a publication-time invalid finish before faulting", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let startCalls = 0;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finishInvocation = finish;
				return {
					start() {
						startCalls += 1;
					},
					cancel() {},
				};
			},
			forceClose() {
				forceCalls += 1;
				finishInvocation?.({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.reentrant-invalid.v1",
			methods: { add: true },
		});
		const subscription = connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.callStarted) {
				finishInvocation?.({ type: "invalid" } as never);
			}
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
			events
				.filter(
					(event) =>
						event.type === "call-started" || event.type === "call-finished",
				)
				.map((event) =>
					event.type === RpcEventTypeEnum.callFinished &&
					event.outcome === RpcCallStatusEnum.rejected
						? [event.type, event.outcome, event.code]
						: [event.type],
				),
		).toEqual([
			[RpcEventTypeEnum.callStarted],
			[
				RpcEventTypeEnum.callFinished,
				"rejected",
				RpcExceptionCodeEnum.outcomeUnknown,
			],
		]);
		subscription.unsubscribe();
		await connector.close();
	});

	it("RPC-SPI-004 faults finish paired with definite non-execution", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
				return undefined;
			},
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.invalid-dne.v1",
			methods: { add: true },
		});

		await expect(
			Promise.resolve().then(() =>
				connector.peer.resolve(descriptor).add(1, 2),
			),
		).rejects.toMatchObject({ code: "protocol" });
		expect(forceCalls).toBe(1);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});
});
