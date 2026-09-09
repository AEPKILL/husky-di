/**
 * @overview Verifies connector termination.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	type RpcEvent,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import { createProtocolHarness } from "./test.utils";

describe("Topology Owner termination", () => {
	it("RPC-LIFE-001 RPC-LIFE-002 RPC-CLOSE-003 gives cold Connector shutdown and close distinct cached modes", async () => {
		const gracefulHarness = createProtocolHarness();
		const graceful = createRpcConnector({
			protocolFactory: gracefulHarness.connectorFactory,
		});
		const gracefulEvents: RpcEvent[] = [];
		graceful.event$.subscribe((event) => gracefulEvents.push(event));
		const gracefulTask = graceful.shutdown();
		expect(graceful.shutdown()).toBe(gracefulTask);
		await gracefulTask;
		expect(graceful.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(graceful.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(gracefulEvents.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(gracefulHarness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
		expect(graceful.close()).toBe(gracefulTask);

		const forcedHarness = createProtocolHarness();
		const forced = createRpcConnector({
			protocolFactory: forcedHarness.connectorFactory,
		});
		const forcedEvents: RpcEvent[] = [];
		forced.event$.subscribe((event) => forcedEvents.push(event));
		const forcedTask = forced.close();
		expect(forced.close()).toBe(forcedTask);
		expect(forced.shutdown()).toBe(forcedTask);
		await forcedTask;
		expect(forced.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forced.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forcedEvents.map((event) => event.type)).toEqual([
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(forcedHarness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-LIFE-001 RPC-LIFE-002 upgrades an in-progress graceful shutdown through the same Promise", async () => {
		let resolveShutdown: (() => void) | undefined;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocolFactory: RpcProtocolConnectorFactory = () => {
			return {
				async bind() {},
				shutdown() {
					return new Promise<void>((resolve) => {
						resolveShutdown = resolve;
					});
				},
				close() {
					closeCalls += 1;
				},
				async cleanup() {
					cleanupCalls += 1;
				},
			};
		};
		const connector = createRpcConnector({ protocolFactory });
		const task = connector.shutdown();
		expect(connector.state).toEqual({ status: "draining" });
		expect(connector.close()).toBe(task);
		await task;
		expect(closeCalls).toBe(1);
		expect(cleanupCalls).toBe(1);
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		resolveShutdown?.();
		await Promise.resolve();
		expect(closeCalls).toBe(1);
	});
});
