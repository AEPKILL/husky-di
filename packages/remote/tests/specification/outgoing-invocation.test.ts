/**
 * @overview Verifies outgoing invocation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { CodedException } from "@husky-di/core";
import { describe, expect, it } from "vitest";
import { RpcConformanceStatusEnum } from "../../src/conformance";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	RpcAcceptorListenerStopReasonEnum,
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	RpcCloseOutcomeEnum,
	RpcCloseReasonEnum,
	RpcConnectorReconnectionAttemptFailureStageEnum,
	RpcConnectorReconnectionEventTypeEnum,
	RpcConnectorReconnectionStopReasonEnum,
	type RpcEvent,
	RpcEventTypeEnum,
	RpcException,
	RpcExceptionCodeEnum,
	type RpcProtocolAcceptorFactory,
	RpcStateStatusEnum,
} from "../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolSession,
	RpcCallOutcome,
} from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";
import { connectProtocolSession, ICalculatorService } from "./test.utils";

describe("custom Protocol outgoing invocations", () => {
	it("RPC-PKG-007 RPC-PKG-008 RPC-PKG-009 exposes stable string enums for public RPC vocabularies", async () => {
		const protocolEntry = await import("../../src/protocol");

		expect(RpcCallDirectionEnum).toEqual({
			incoming: "incoming",
			outgoing: "outgoing",
		});
		expect(RpcExceptionCodeEnum).toEqual({
			canceled: "canceled",
			unavailable: "unavailable",
			outcomeUnknown: "outcome-unknown",
			handlerFailed: "handler-failed",
			unknownService: "unknown-service",
			unknownMethod: "unknown-method",
			protocol: "protocol",
		});
		expect(RpcCloseReasonEnum.cleanupFailed).toBe("cleanup-failed");
		expect(RpcCallStatusEnum).toEqual({
			fulfilled: "fulfilled",
			rejected: "rejected",
			terminated: "terminated",
		});
		expect(RpcEventTypeEnum.topologyClosed).toBe("topology-closed");
		expect(RpcCloseOutcomeEnum.failed).toBe("failed");
		expect(RpcStateStatusEnum.recovering).toBe("recovering");
		expect(RpcStateStatusEnum.monitoring).toBe("monitoring");
		expect(RpcStateStatusEnum.reconnecting).toBe("reconnecting");
		expect(RpcStateStatusEnum.waiting).toBe("waiting");
		expect(RpcConnectorReconnectionAttemptFailureStageEnum).toEqual({
			adapterFactory: "adapter-factory",
			connectorAttempt: "connector-attempt",
			attemptTimeout: "attempt-timeout",
		});
		expect(RpcConnectorReconnectionEventTypeEnum).toEqual({
			attemptFailed: "attempt-failed",
		});
		expect(RpcConnectorReconnectionStopReasonEnum).toEqual({
			requested: "requested",
			initialConnectionFailed: "initial-connection-failed",
			retriesExhausted: "retries-exhausted",
			connectorTerminated: "connector-terminated",
		});
		expect(RpcAcceptorListenerStopReasonEnum.resourcePressure).toBe(
			"resource-pressure",
		);
		expect(RpcCallTerminalTypeEnum.sessionTerminated).toBe(
			"session-terminated",
		);
		expect(RpcIncomingCallKindEnum.handler).toBe("handler");
		expect(RpcProtocolSessionTransitionTypeEnum).toEqual({
			draining: "draining",
			recovering: "recovering",
			recovered: "recovered",
			closed: "closed",
		});
		expect(RpcConformanceStatusEnum).toEqual({
			passed: "passed",
			failed: "failed",
		});
		expect(protocolEntry.RpcExceptionCodeEnum).toBe(RpcExceptionCodeEnum);
		expect(protocolEntry.RpcCloseReasonEnum).toBe(RpcCloseReasonEnum);
	});

	it("RPC-CALL-009 exposes a caller-constructible coded RpcException", () => {
		const cause = new Error("trusted local failure");
		const exception = new RpcException(RpcExceptionCodeEnum.unavailable, cause);

		expect(exception).toBeInstanceOf(CodedException);
		expect(exception).toMatchObject({
			name: "RpcException",
			code: "unavailable",
			detail: "RPC failed.",
			cause,
		});
	});

	it("RPC-BASE-001 RPC-CALL-007 does not retry an admitted identity after its evidence is lost", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let reserveCalls = 0;
		let startCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation(_request, finish) {
				reserveCalls += 1;
				finishInvocation = finish;
				return {
					start() {
						startCalls += 1;
					},
					cancel() {},
				};
			},
			forceClose() {},
		};
		const { connector, events, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const remote = connector.peer.resolve(descriptor);
		const admitted = remote.add(1, 2);

		finishInvocation?.({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.outcomeUnknown,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
		});

		const admittedError = await admitted.catch((error: unknown) => error);
		expect(admittedError).toBeInstanceOf(RpcException);
		expect(admittedError).toBeInstanceOf(CodedException);
		expect(admittedError).toMatchObject({
			code: "outcome-unknown",
			detail: "RPC failed.",
			cause: undefined,
		});
		expect(admittedError).not.toHaveProperty("details");
		expect(reserveCalls).toBe(1);
		expect(startCalls).toBe(1);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "call-finished",
				outcome: "rejected",
				code: "outcome-unknown",
			}),
		);

		await expect(remote.add(3, 4)).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(reserveCalls).toBe(1);
		await connector.close();
	});

	it("RPC-SPI-011 closes the Acceptor Protocol role before projecting an owner fault", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let acceptor: ReturnType<typeof createRpcAcceptor> | undefined;
		const operations: string[] = [];
		const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
			protocolHost = host;
			return {
				async accept() {},
				async shutdown() {},
				close() {
					operations.push("runtime-close");
					expect(acceptor?.state.status).toBe("active");
				},
				async cleanup() {
					operations.push("runtime-cleanup");
				},
			};
		};
		acceptor = createRpcAcceptor({ protocolFactory });
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));
		const first = protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				operations.push("first-force");
			},
		});
		const second = protocolHost?.admitSession({
			prepareInvocation: () => undefined,
			forceClose() {
				operations.push("second-force");
			},
		});
		if (
			protocolHost === undefined ||
			first === undefined ||
			second === undefined
		) {
			throw new Error("Expected two admitted Acceptor Sessions.");
		}
		const [firstPeer, secondPeer] = acceptor.peers;
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two public Acceptor peers.");
		}
		const fault = new Error("shared Protocol invariant failed");

		protocolHost.fault(RpcCloseReasonEnum.protocolFault, fault);

		expect(operations[0]).toBe("runtime-close");
		expect(acceptor.state).toEqual({ status: "closing" });
		expect(acceptor.peers).toEqual([]);
		expect(firstPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(secondPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-opened",
			"peer-closed",
			"peer-closed",
			"owner-closing",
		]);

		await expect(acceptor.close()).resolves.toBeUndefined();
		expect(acceptor.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { code: "protocol", cause: fault },
		});
		expect(operations).toContain("runtime-cleanup");
	});

	it("RPC-SPI-004 RPC-SPI-005 RPC-CALL-005 RPC-CALL-006 drives preparation, finish, observations, and result", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let startCalls = 0;
		let request:
			| {
					readonly service: string;
					readonly method: string;
					readonly args: { readonly value: readonly unknown[] };
			  }
			| undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation(nextRequest, finish) {
				request = nextRequest;
				finishInvocation = finish;
				return {
					start() {
						startCalls += 1;
					},
					cancel() {},
				};
			},
			forceClose() {},
		};
		const { connector, host, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const result = connector.peer.resolve(descriptor).add(1, 2);

		expect(request?.service).toBe("example.calculator.v1");
		expect(request?.method).toBe("add");
		expect(request?.args.value).toEqual([1, 2]);
		expect(startCalls).toBe(1);
		const callEvents = events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(callEvents).toMatchObject([
			{
				type: "call-started",
				direction: "outgoing",
				service: "example.calculator.v1",
				method: "add",
			},
		]);

		finishInvocation?.({
			type: RpcCallTerminalTypeEnum.returned,
			value: host.normalizeApplicationValue(3),
		});
		await expect(result).resolves.toBe(3);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toMatchObject([
			{ type: "call-started" },
			{
				type: "call-finished",
				direction: "outgoing",
				service: "example.calculator.v1",
				method: "add",
				outcome: "fulfilled",
			},
		]);
	});

	it("RPC-CALL-003 RPC-CALL-006 uses trusted AbortSignal intrinsics and preserves canceled settlement", async () => {
		let finishInvocation: ((outcome: RpcCallOutcome) => void) | undefined;
		let cancelCalls = 0;
		let startCalls = 0;
		let shadowMethodCalls = 0;
		let requestArguments: readonly unknown[] | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation(request, finish) {
				requestArguments = request.args.value;
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
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { cancel: { cancelable: true } },
		});
		const controller = new AbortController();
		Object.defineProperties(controller.signal, {
			addEventListener: {
				value: () => {
					shadowMethodCalls += 1;
				},
			},
			removeEventListener: {
				value: () => {
					shadowMethodCalls += 1;
				},
			},
		});

		const result = connector.peer
			.resolve(descriptor)
			.cancel("value", controller.signal);
		expect(requestArguments).toEqual(["value"]);
		expect(startCalls).toBe(1);
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: "canceled" });
		expect(cancelCalls).toBe(1);
		expect(shadowMethodCalls).toBe(0);
		expect(events[events.length - 1]).toMatchObject({
			type: "call-finished",
			outcome: "rejected",
			code: "canceled",
		});
	});

	it("RPC-SPI-004 maps preparation capacity failure to unavailable without call events", async () => {
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		await expect(
			connector.peer.resolve(descriptor).add(1, 2),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
	});
});
