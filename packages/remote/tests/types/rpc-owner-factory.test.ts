/**
 * @overview Compile-time Topology Owner factory and policy probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	createRpcAcceptor,
	createRpcConnector,
	type IRpcAcceptor,
	type IRpcConnector,
	type RpcAcceptorOptions,
	RpcCloseReasonEnum,
	type RpcConnectorOptions,
} from "../../src/index";

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

const connectorOptions: RpcConnectorOptions = {};
const acceptorOptions: RpcAcceptorOptions = {};
const closeReason: RpcCloseReasonEnum = RpcCloseReasonEnum.cleanupFailed;
void connector;
void acceptor;
void connectorOptions;
void acceptorOptions;
void closeReason;

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
