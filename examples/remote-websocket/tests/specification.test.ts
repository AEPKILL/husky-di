/**
 * @overview Remote WebSocket example specification coverage.
 * @author AEPKILL
 * @created 2026-08-21 00:26:50
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	type CreateRpcConnectorReconnectionOptions,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
	RpcStateStatusEnum,
} from "@husky-di/remote";

import { startRpcConnectorReconnection } from "@/web/hooks/use-rpc-connector-reconnection";
import { getRpcPeerStatusPresentation } from "@/web/utils/rpc-peer-status-presentation.util";

describe("Remote WebSocket example specification", () => {
	it("EXAMPLE-WS-STATE-001 presents every peer state without hiding disconnection", () => {
		assert.deepEqual(getRpcPeerStatusPresentation(RpcStateStatusEnum.unbound), {
			label: "Not connected",
			variant: "muted",
		});
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.connecting),
			{ label: "Connecting", variant: "warning" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.connected),
			{ label: "Live transport", variant: "default" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.recovering),
			{ label: "Transport disconnected", variant: "danger" },
		);
		assert.deepEqual(
			getRpcPeerStatusPresentation(RpcStateStatusEnum.draining),
			{
				label: "Disconnecting",
				variant: "warning",
			},
		);
		assert.deepEqual(getRpcPeerStatusPresentation(RpcStateStatusEnum.closed), {
			label: "Connection closed",
			variant: "danger",
		});
	});

	it("EXAMPLE-WS-RECOVERY-001 delegates connection attempts to one Reconnection supervisor", async () => {
		const adapters: IRpcConnectorAdapter[] = [];
		const attempt = Promise.withResolvers<void>();
		const stopped = Promise.withResolvers<void>();
		const lifecycleCalls: string[] = [];
		const connector = {
			close() {
				lifecycleCalls.push("close");
				return Promise.resolve();
			},
		} as IRpcConnector;
		let createCalls = 0;
		let connectCalls = 0;
		let stopCalls = 0;
		const createReconnection = (
			options: CreateRpcConnectorReconnectionOptions,
		): IRpcConnectorReconnection => {
			createCalls += 1;
			assert.equal(options.connector, connector);
			return {
				connector: options.connector,
				state: { status: RpcStateStatusEnum.idle },
				state$: undefined as never,
				event$: undefined as never,
				connect() {
					connectCalls += 1;
					adapters.push(options.adapterFactory());
					return attempt.promise;
				},
				stop() {
					stopCalls += 1;
					lifecycleCalls.push("stop");
					return stopped.promise;
				},
			};
		};
		const errors: unknown[] = [];
		const stop = startRpcConnectorReconnection(
			connector,
			() => ({ id: adapters.length + 1 }) as unknown as IRpcConnectorAdapter,
			(error) => errors.push(error),
			createReconnection,
		);

		assert.equal(createCalls, 1);
		assert.equal(connectCalls, 1);
		assert.equal(adapters.length, 1);
		attempt.reject(new Error("offline"));
		await Promise.resolve();
		await Promise.resolve();
		assert.deepEqual(
			errors.map((error) => (error instanceof Error ? error.message : error)),
			["offline"],
		);

		const cleanup = stop();
		assert.equal(stopCalls, 1);
		assert.deepEqual(lifecycleCalls, ["stop"]);
		stopped.resolve();
		await cleanup;
		assert.deepEqual(lifecycleCalls, ["stop", "close"]);
	});
});
