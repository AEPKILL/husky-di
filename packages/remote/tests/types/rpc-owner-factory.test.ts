/**
 * @overview Compile-time Topology Owner factory and policy probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcAcceptor,
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcAcceptor,
	type IRpcConnector,
	type IRpcConnectorReconnection,
	type RpcAcceptorOptions,
	RpcCloseReasonEnum,
	type RpcConnectorAdapterFactory,
	type RpcConnectorOptions,
	type RpcConnectorReconnectionState,
} from "../../src/index";

declare const adapterFactory: RpcConnectorAdapterFactory;

const connector: IRpcConnector = createRpcConnector({
	runtimePolicy: {
		maxPendingInvocationsPerSession: 8,
		maxRetainedBytesPerSession: 4 * 1024 * 1024,
		maxHandlersPerSession: 2,
		ackDelayMs: 25,
		activityProbeIntervalMs: 100,
		silenceTimeoutMs: 300,
		sendProgressTimeoutMs: 100,
		bindingAttemptTimeoutMs: 100,
		recoveryGraceMs: 100,
		shutdownDeadlineMs: 100,
	},
});

const acceptor: IRpcAcceptor = createRpcAcceptor({
	runtimePolicy: {
		maxSessions: 2,
		maxHandshakes: 1,
		maxPendingInvocationsPerSession: 8,
		maxRetainedBytesPerSession: 4 * 1024 * 1024,
		maxRetainedBytesTotal: 4 * 1024 * 1024 + 512 * 1024,
		maxHandlersPerSession: 2,
		maxHandlersTotal: 2,
		ackDelayMs: 25,
		activityProbeIntervalMs: 100,
		silenceTimeoutMs: 300,
		sendProgressTimeoutMs: 100,
		bindingAttemptTimeoutMs: 100,
		recoveryGraceMs: 100,
		shutdownDeadlineMs: 100,
	},
});

const reconnectionOptions: CreateRpcConnectorReconnectionOptions = {
	connector,
	adapterFactory,
	policy: { retryDelaysMs: [0, 100], attemptTimeoutMs: 1_000 },
};
const reconnection: IRpcConnectorReconnection =
	createRpcConnectorReconnection(reconnectionOptions);
const reconnectionConnector: IRpcConnector = reconnection.connector;
const reconnectionState: RpcConnectorReconnectionState = reconnection.state;
const reconnectTask: Promise<void> = reconnection.connect();
const stopReconnectionTask: Promise<void> = reconnection.stop();
const directConnectTask: Promise<void> = connector.connect({
	adapter: adapterFactory(),
	signal: new AbortController().signal,
});

const connectorOptions: RpcConnectorOptions = {};
const acceptorOptions: RpcAcceptorOptions = {};
const closeReason: RpcCloseReasonEnum = RpcCloseReasonEnum.cleanupFailed;
void connector;
void acceptor;
void connectorOptions;
void acceptorOptions;
void closeReason;
void reconnectionConnector;
void reconnectionState;
void reconnectTask;
void stopReconnectionTask;
void directConnectTask;

// @ts-expect-error RPC-START-005 requires the connect options record.
connector.connect(adapterFactory());

createRpcConnectorReconnection({
	connector,
	adapterFactory,
	policy: {
		// @ts-expect-error RPC-RECONNECT-001 closes the policy schema.
		unknown: true,
	},
});

createRpcConnector({
	runtimePolicy: {
		// @ts-expect-error RPC-POLICY-001 derives maxSessions for Connector.
		maxSessions: 2,
	},
});

createRpcConnector({
	// @ts-expect-error RPC-API-001 closes the outer options schema.
	unknown: true,
});

createRpcAcceptor({
	runtimePolicy: {
		// @ts-expect-error RPC-API-001 closes the policy schema.
		unknown: 1,
	},
});
