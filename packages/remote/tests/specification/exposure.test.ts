/**
 * @overview Verifies exposure.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import type { IRpcProtocolSession } from "../../src/protocol";
import {
	type CalculatorService,
	createProtocolHarness,
	ICalculatorService,
} from "./test.utils";

describe("exposure registries and remote facades", () => {
	it("RPC-DESC-004 RPC-DESC-005 installs exposures atomically and cleans them up idempotently", () => {
		const { connectorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: {
				add: true,
				cancel: { cancelable: true },
			},
		});
		const invalidImplementation = {
			add(left: number, right: number) {
				return left + right;
			},
			cancel: "not a function",
		};
		const implementation: CalculatorService = {
			add(left, right) {
				return left + right;
			},
			async cancel(value) {
				return value;
			},
		};

		expect(() =>
			connector.peer.expose(descriptor, invalidImplementation as never),
		).toThrow(TypeError);
		const cleanup = connector.peer.expose(descriptor, implementation);
		expect(() => connector.peer.expose(descriptor, implementation)).toThrow(
			TypeError,
		);
		expect(cleanup()).toBeUndefined();
		expect(cleanup()).toBeUndefined();
		expect(() =>
			connector.peer.expose(descriptor, implementation),
		).not.toThrow();
	});

	it("RPC-CALL-001 creates a frozen non-thenable single-peer facade", async () => {
		const connectorHarness = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorHarness.connectorFactory,
		});
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		const remote = connector.peer.resolve(descriptor);
		expect(Object.getPrototypeOf(remote)).toBeNull();
		expect(Object.isFrozen(remote)).toBe(true);
		expect(Object.keys(remote)).toEqual(["add"]);
		expect(remote.then).toBeUndefined();
		expect(await Promise.resolve(remote)).toBe(remote);

		const { add } = remote;
		await expect(add(1, 2)).rejects.toMatchObject({ code: "unavailable" });
	});

	it("RPC-API-007 omits the aggregate Acceptor facade", () => {
		const { acceptorFactory } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocolFactory: acceptorFactory });

		expect("resolveAll" in acceptor).toBe(false);
		expect(
			Object.getOwnPropertyNames(Object.getPrototypeOf(acceptor)),
		).not.toContain("resolveAll");
	});

	it("RPC-DESC-004 RPC-DESC-005 applies the same duplicate and cleanup rules to Acceptor owner exposure", () => {
		const { acceptorFactory, acceptorHosts } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocolFactory: acceptorFactory });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const implementation = {
			add: (left: number, right: number) => left + right,
		};

		const cleanup = acceptor.expose(descriptor, implementation);
		expect(() => acceptor.expose(descriptor, implementation)).toThrow(
			TypeError,
		);
		const session: IRpcProtocolSession = {
			prepareInvocation: () => undefined,
			forceClose() {},
		};
		expect(acceptorHosts[0]?.admitSession(session)).toBeDefined();
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		expect(() => peer.expose(descriptor, implementation)).toThrow(TypeError);
		cleanup();
		cleanup();
		const peerCleanup = peer.expose(descriptor, implementation);
		expect(() => acceptor.expose(descriptor, implementation)).toThrow(
			TypeError,
		);
		peerCleanup();
		const replacementCleanup = acceptor.expose(descriptor, implementation);
		replacementCleanup();
	});

	it("RPC-CALL-002 validates the dedicated cancellation slot before peer availability", async () => {
		const { connectorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { cancel: { cancelable: true } },
		});
		const remote = connector.peer.resolve(descriptor);
		const escapedCancel = remote.cancel as unknown as (
			...args: unknown[]
		) => Promise<unknown>;
		let businessGetterCalls = 0;
		const businessValue = Object.defineProperty({}, "value", {
			enumerable: true,
			get() {
				businessGetterCalls += 1;
				return "not inspected";
			},
		});

		await expect(escapedCancel()).rejects.toBeInstanceOf(TypeError);
		await expect(escapedCancel(businessValue)).rejects.toBeInstanceOf(
			TypeError,
		);
		await expect(
			escapedCancel(businessValue, {
				aborted: false,
				addEventListener() {},
			}),
		).rejects.toBeInstanceOf(TypeError);

		const controller = new AbortController();
		controller.abort();
		await expect(
			escapedCancel(businessValue, controller.signal),
		).rejects.toMatchObject({ code: "canceled" });
		await expect(escapedCancel(businessValue, undefined)).rejects.toMatchObject(
			{ code: "unavailable" },
		);
		expect(businessGetterCalls).toBe(0);
	});
});
