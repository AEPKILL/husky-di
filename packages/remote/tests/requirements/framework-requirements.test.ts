/**
 * @overview Verifies framework requirements.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it } from "vitest";
import * as rootEntry from "../../src/index";
import {
	createRpcAcceptor,
	createRpcConnector,
	RpcCloseReasonEnum,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
} from "../../src/protocol";
import * as protocolEntry from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";
import * as transportEntry from "../../src/transport";
import {
	consumeIncomingKind,
	createAcceptorHarness,
	createConnectorHarness,
	createEmptySession,
	requirementDescriptor,
} from "./framework/test.utils";

describe("Framework requirement evidence", () => {
	it("RPC-BASE-002 keeps public Observable subscriptions resource-neutral", () => {
		let connectorCreations = 0;
		let acceptorCreations = 0;
		let bindCalls = 0;
		let acceptCalls = 0;
		const connectorProtocolFactory: RpcProtocolConnectorFactory = () => {
			connectorCreations += 1;
			return {
				async bind() {
					bindCalls += 1;
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const acceptorProtocolFactory: RpcProtocolAcceptorFactory = () => {
			acceptorCreations += 1;
			return {
				async accept() {
					acceptCalls += 1;
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({
			protocolFactory: connectorProtocolFactory,
		});
		const acceptor = createRpcAcceptor({
			protocolFactory: acceptorProtocolFactory,
		});
		const before = [
			connectorCreations,
			acceptorCreations,
			bindCalls,
			acceptCalls,
		];
		const subscriptions = [
			connector.state$.subscribe(),
			connector.peer.state$.subscribe(),
			connector.event$.subscribe(),
			acceptor.state$.subscribe(),
			acceptor.peers$.subscribe(),
			acceptor.event$.subscribe(),
		];

		for (const subscription of subscriptions) {
			subscription.unsubscribe();
		}

		expect([
			connectorCreations,
			acceptorCreations,
			bindCalls,
			acceptCalls,
		]).toEqual(before);
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(acceptor.peers).toEqual([]);
	});

	it("RPC-BASE-003 RPC-EVENT-005 RPC-POLICY-004 keeps private machinery out of public runtime surfaces", () => {
		expect(Object.keys(rootEntry).sort()).toEqual([
			"RpcAcceptorListenerStopReasonEnum",
			"RpcCallDirectionEnum",
			"RpcCallStatusEnum",
			"RpcCloseOutcomeEnum",
			"RpcCloseReasonEnum",
			"RpcConnectorReconnectionAttemptFailureStageEnum",
			"RpcConnectorReconnectionEventTypeEnum",
			"RpcConnectorReconnectionStopReasonEnum",
			"RpcEventTypeEnum",
			"RpcException",
			"RpcExceptionCodeEnum",
			"RpcStateStatusEnum",
			"createRemoteServiceDescriptor",
			"createRpcAcceptor",
			"createRpcConnector",
			"createRpcConnectorReconnection",
			"createRpcProtocolAcceptor",
			"createRpcProtocolConnector",
		]);
		expect(Object.keys(protocolEntry).sort()).toEqual([
			"RpcCallTerminalTypeEnum",
			"RpcCloseReasonEnum",
			"RpcExceptionCodeEnum",
			"RpcIncomingCallKindEnum",
			"RpcProtocolSessionTransitionTypeEnum",
			"createRpcProtocolAcceptor",
			"createRpcProtocolConnector",
		]);
		expect(Object.keys(transportEntry)).toEqual([]);

		const connector = createRpcConnector();
		const publicKeys = Reflect.ownKeys(connector).map(String);
		const forbidden =
			/(codec|handshake|proof|ack|sequence|replay|ledger|scheduler|queue|lane|permit|priority|pause|resume|transcript|telemetry|trace|exporter|redact|capacity)/iu;
		expect(publicKeys.filter((key) => forbidden.test(key))).toEqual([]);
		expect(
			Reflect.ownKeys(connector.peer)
				.map(String)
				.filter((key) => forbidden.test(key)),
		).toEqual([]);
	});

	it("RPC-VALUE-003 enforces the common Application Value profile before custom Protocol preparation", async () => {
		let reservationCalls = 0;
		let capturedRequest: IRpcProtocolCallRequest | undefined;
		const session: IRpcProtocolSession = {
			prepareInvocation(request, finish) {
				reservationCalls += 1;
				capturedRequest = request;
				return {
					start() {
						finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
					},
					cancel() {},
				};
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		const input = { secret: "caller-owned" };

		await expect(
			harness.connector.peer.resolve(requirementDescriptor).echo(input),
		).resolves.toBeUndefined();
		input.secret = "mutated";
		expect(capturedRequest?.args.value).toEqual([{ secret: "caller-owned" }]);
		expect(Object.isFrozen(capturedRequest?.args.value[0])).toBe(true);

		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo(new Map() as never),
		).rejects.toBeInstanceOf(TypeError);
		expect(reservationCalls).toBe(1);
		await harness.connector.close();
	});

	it("RPC-DESC-005 keeps an admitted handler route after synchronous idempotent cleanup", async () => {
		const harness = createConnectorHarness();
		const sessionHost = await harness.connect();
		const cleanup = harness.connector.peer.expose(requirementDescriptor, {
			async cancel(value) {
				return value;
			},
			echo: ({ secret }) => ({ secret: `captured:${secret}` }),
			async wait() {
				return "done";
			},
		});
		let call: IRpcProtocolIncomingHandlerCall | undefined;
		const reserved = sessionHost.reserveIncomingCall(
			{
				service: "example.requirements.v1",
				method: "echo",
				args: harness.host.normalizeApplicationArguments([{ secret: "value" }]),
			},
			(reservation) => {
				if (reservation.kind !== "handler") {
					throw new Error("Expected a captured handler reservation.");
				}
				call = reservation.commit();
				return undefined;
			},
		);
		expect(reserved).toBe(true);

		expect(cleanup()).toBeUndefined();
		expect(() => cleanup()).not.toThrow();
		if (call === undefined) {
			throw new Error("Expected a captured handler reservation.");
		}
		await expect(call.handlerOutcome).resolves.toMatchObject({
			type: "returned",
			value: { value: { secret: "captured:value" } },
		});
		call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });
		await harness.connector.close();
	});

	it("RPC-API-006 gates exposure synchronously while allowing unbound and recovering peers", async () => {
		const harness = createConnectorHarness();
		const unboundCleanup = harness.connector.peer.expose(
			requirementDescriptor,
			{
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			},
		);
		unboundCleanup();
		const sessionHost = await harness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		const recoveringCleanup = harness.connector.peer.expose(
			requirementDescriptor,
			{
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			},
		);
		recoveringCleanup();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});

		expect(() =>
			harness.connector.peer.expose(requirementDescriptor, {
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			}),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		await harness.connector.close();
		expect(() =>
			harness.connector.peer.expose(requirementDescriptor, {
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			}),
		).toThrow(expect.objectContaining({ code: "unavailable" }));

		const { acceptor, host } = createAcceptorHarness();
		const implementation = {
			async cancel(value: string) {
				return value;
			},
			echo: (value: { readonly secret: string }) => value,
			async wait() {
				return "done";
			},
		};
		const ownerCleanup = acceptor.expose(requirementDescriptor, implementation);
		const futureSessionHost = host.admitSession(createEmptySession());
		expect(
			consumeIncomingKind(futureSessionHost, {
				service: "example.requirements.v1",
				method: "wait",
				args: host.normalizeApplicationArguments([]),
			}),
		).toBe("handler");
		ownerCleanup();
		const currentSessionHost = host.admitSession(createEmptySession());
		const currentCleanup = acceptor.expose(
			requirementDescriptor,
			implementation,
		);
		expect(
			consumeIncomingKind(currentSessionHost, {
				service: "example.requirements.v1",
				method: "wait",
				args: host.normalizeApplicationArguments([]),
			}),
		).toBe("handler");
		currentCleanup();
		const gatedPeer = acceptor.peers[0];
		const acceptorClose = acceptor.close();
		expect(() =>
			acceptor.expose(requirementDescriptor, implementation),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		expect(() =>
			gatedPeer?.expose(requirementDescriptor, implementation),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		await acceptorClose;
	});
});
