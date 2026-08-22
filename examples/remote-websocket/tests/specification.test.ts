/**
 * @overview Remote WebSocket example specification coverage.
 * @author AEPKILL
 * @created 2026-08-21 00:26:50
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcConnector,
	type IRpcConnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";

import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import { greetCancelable } from "@/utils/greeting.util";
import { startRpcConnectorReconnection } from "@/web/hooks/use-rpc-connector-reconnection";
import { getRpcControlAvailability } from "@/web/utils/rpc-control-availability.util";
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

	it("EXAMPLE-WS-RECOVERY-001 starts and cleans up the current Reconnection supervisor", async () => {
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
		const { stop } = startRpcConnectorReconnection(
			connector,
			() => createConnectedAdapter(createTestConnection()),
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

	it("EXAMPLE-WS-RECOVERY-002 waits for manual Recovery before replacing the supervisor", async () => {
		assert.deepEqual(
			getRpcControlAvailability(RpcStateStatusEnum.connected, false, false),
			{ call: true, disconnect: true, recover: false },
		);
		assert.deepEqual(
			getRpcControlAvailability(RpcStateStatusEnum.recovering, true, false),
			{ call: true, disconnect: false, recover: true },
		);
		assert.deepEqual(
			getRpcControlAvailability(RpcStateStatusEnum.recovering, false, false),
			{ call: true, disconnect: false, recover: false },
		);
		assert.deepEqual(
			getRpcControlAvailability(RpcStateStatusEnum.connected, false, true),
			{ call: true, disconnect: false, recover: false },
		);
		assert.deepEqual(
			getRpcControlAvailability(RpcStateStatusEnum.connecting, false, false),
			{ call: false, disconnect: false, recover: false },
		);

		const closedConnections: number[] = [];
		let createdAdapters = 0;
		let createdReconnections = 0;
		let connectorCloseCalls = 0;
		const connectionCloseError = new Error("Connection cleanup failed.");
		const connectionErrors: unknown[] = [];
		const firstSupervisorStopped = Promise.withResolvers<void>();
		const lifecycleCalls: string[] = [];
		const connector = {
			close: () => {
				connectorCloseCalls += 1;
				lifecycleCalls.push("connector-close");
				return Promise.resolve();
			},
		} as IRpcConnector;
		const controls = startRpcConnectorReconnection(
			connector,
			() => {
				createdAdapters += 1;
				const connectionId = createdAdapters;
				return createConnectedAdapter(
					createTestConnection(
						() => {
							closedConnections.push(connectionId);
							lifecycleCalls.push(`connection-${connectionId}-close`);
						},
						connectionId === 1 ? connectionCloseError : undefined,
					),
				);
			},
			(error) => connectionErrors.push(error),
			(options) => {
				createdReconnections += 1;
				const reconnectionId = createdReconnections;
				assert.equal(options.connector, connector);
				return {
					connector: options.connector,
					state: { status: RpcStateStatusEnum.idle },
					state$: undefined as never,
					event$: undefined as never,
					connect() {
						lifecycleCalls.push(`supervisor-${reconnectionId}-connect`);
						options.adapterFactory();
						return Promise.resolve();
					},
					stop() {
						lifecycleCalls.push(`supervisor-${reconnectionId}-stop`);
						return reconnectionId === 1
							? firstSupervisorStopped.promise
							: Promise.resolve();
					},
				};
			},
		);

		const disconnectTask = controls.disconnect();
		await Promise.resolve();
		assert.deepEqual(lifecycleCalls, [
			"supervisor-1-connect",
			"supervisor-1-stop",
		]);
		assert.deepEqual(closedConnections, []);
		firstSupervisorStopped.resolve();
		await disconnectTask;

		assert.equal(createdReconnections, 1);
		assert.equal(createdAdapters, 1);
		assert.deepEqual(closedConnections, [1]);
		assert.deepEqual(connectionErrors, [connectionCloseError]);
		assert.equal(connectorCloseCalls, 0);
		assert.deepEqual(lifecycleCalls, [
			"supervisor-1-connect",
			"supervisor-1-stop",
			"connection-1-close",
		]);

		await controls.recover();

		assert.equal(createdReconnections, 2);
		assert.equal(createdAdapters, 2);
		assert.deepEqual(lifecycleCalls, [
			"supervisor-1-connect",
			"supervisor-1-stop",
			"connection-1-close",
			"supervisor-2-connect",
		]);

		await controls.stop();
		assert.equal(connectorCloseCalls, 1);
		assert.deepEqual(lifecycleCalls.slice(-2), [
			"supervisor-2-stop",
			"connector-close",
		]);
	});

	it("EXAMPLE-WS-CANCEL-001 wires cancellation through the greeting caller and handler", async () => {
		const connector = createRpcConnector();
		const remoteGreeting = connector.peer.resolve(REMOTE_GREETING_SERVICE);
		const callerController = new AbortController();
		callerController.abort();

		try {
			await assert.rejects(
				remoteGreeting.greetCancelable(
					"Specification caller",
					10_000,
					callerController.signal,
				),
				(error) => {
					assert.ok(error instanceof RpcException);
					assert.equal(error.code, RpcExceptionCodeEnum.canceled);
					return true;
				},
			);
		} finally {
			await connector.close();
		}

		const handlerController = new AbortController();
		const pendingGreeting = greetCancelable(
			"Specification handler",
			10_000,
			handlerController.signal,
		);
		handlerController.abort();
		await assert.rejects(pendingGreeting, { name: "AbortError" });
	});
});

function createTestConnection(
	onClose: () => void = () => {},
	closeError?: Error,
): IRpcConnection {
	return {
		message$: undefined as never,
		send: () => Promise.resolve(),
		close: () => {
			onClose();
			return closeError === undefined
				? Promise.resolve()
				: Promise.reject(closeError);
		},
	};
}

function createConnectedAdapter(
	connection: IRpcConnection,
): IRpcConnectorAdapter {
	return {
		connection$: {
			subscribe(observer: { readonly next?: (value: IRpcConnection) => void }) {
				observer.next?.(connection);
				return { unsubscribe() {} };
			},
		} as never,
		connect: () => Promise.resolve(),
	};
}
