/**
 * @overview Compile-time Topology Owner factory and policy probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { assertType, expectTypeOf, test } from "vitest";

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcAcceptor,
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcAcceptor,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
	type RpcAcceptorOptions,
	type RpcAcceptorRuntimePolicyOptions,
	RpcCloseReasonEnum,
	type RpcConnectorAdapterFactory,
	type RpcConnectorConnectOptions,
	type RpcConnectorOptions,
	type RpcConnectorReconnectionPolicyOptions,
	type RpcConnectorReconnectionState,
	type RpcConnectorRuntimePolicyOptions,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";

declare const adapterFactory: RpcConnectorAdapterFactory;
declare const connectorProtocolFactory: RpcProtocolConnectorFactory;
declare const acceptorProtocolFactory: RpcProtocolAcceptorFactory;

const connector = createRpcConnector({
	protocolFactory: connectorProtocolFactory,
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

test("RPC-API-001 exposes typed Topology Owner factories", () => {
	const acceptor = createRpcAcceptor({
		protocolFactory: acceptorProtocolFactory,
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
	const reconnection = createRpcConnectorReconnection(reconnectionOptions);

	expectTypeOf(connector).toEqualTypeOf<IRpcConnector>();
	expectTypeOf(acceptor).toEqualTypeOf<IRpcAcceptor>();
	expectTypeOf(reconnection).toEqualTypeOf<IRpcConnectorReconnection>();
	expectTypeOf(reconnection.connector).toEqualTypeOf<IRpcConnector>();
	expectTypeOf(
		reconnection.state,
	).toEqualTypeOf<RpcConnectorReconnectionState>();
	expectTypeOf(reconnection.connect()).toEqualTypeOf<Promise<void>>();
	expectTypeOf(reconnection.stop()).toEqualTypeOf<Promise<void>>();
	expectTypeOf(
		connector.connect({
			adapter: adapterFactory(),
			signal: new AbortController().signal,
		}),
	).toEqualTypeOf<Promise<void>>();
	assertType<RpcConnectorOptions>({
		protocolFactory: connectorProtocolFactory,
	});
	assertType<RpcAcceptorOptions>({ protocolFactory: acceptorProtocolFactory });
	assertType<RpcAcceptorRuntimePolicyOptions>({ maxSessions: undefined });
	assertType<RpcConnectorRuntimePolicyOptions>({
		maxHandlersPerSession: undefined,
	});
	expectTypeOf<
		RpcConnectorConnectOptions["adapter"]
	>().toEqualTypeOf<IRpcConnectorAdapter>();
	expectTypeOf<RpcConnectorConnectOptions["signal"]>().toEqualTypeOf<
		AbortSignal | undefined
	>();
	expectTypeOf<
		CreateRpcConnectorReconnectionOptions["connector"]
	>().toEqualTypeOf<IRpcConnector>();
	expectTypeOf<
		CreateRpcConnectorReconnectionOptions["adapterFactory"]
	>().toEqualTypeOf<RpcConnectorAdapterFactory>();
	expectTypeOf<
		RpcConnectorReconnectionPolicyOptions["retryDelaysMs"]
	>().toEqualTypeOf<readonly number[] | undefined>();
	assertType<RpcCloseReasonEnum>(RpcCloseReasonEnum.cleanupFailed);
});

test("RPC-PKG-004 keeps schema-derived caller options readonly", () => {
	const connectorOptions = {} as RpcConnectorOptions;
	const policyOptions = {} as RpcConnectorReconnectionPolicyOptions;

	// @ts-expect-error RPC-PKG-004 keeps schema-derived option fields readonly.
	connectorOptions.runtimePolicy = {};
	// @ts-expect-error RPC-PKG-004 keeps schema-derived policy fields readonly.
	policyOptions.attemptTimeoutMs = 1;
});

test("RPC-START-005 requires the Connector connect options record", () => {
	// @ts-expect-error RPC-START-005 requires the connect options record.
	connector.connect(adapterFactory());
});

test("RPC-RECONNECT-001 closes the Reconnection policy schema", () => {
	createRpcConnectorReconnection({
		connector,
		adapterFactory,
		policy: {
			// @ts-expect-error RPC-RECONNECT-001 closes the policy schema.
			unknown: true,
		},
	});
});

test("RPC-POLICY-001 derives Connector policy totals", () => {
	createRpcConnector({
		runtimePolicy: {
			// @ts-expect-error RPC-POLICY-001 derives maxSessions for Connector.
			maxSessions: 2,
		},
	});
});

test("RPC-API-001 closes Topology Owner option schemas", () => {
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

	createRpcConnector({
		// @ts-expect-error RPC-API-001 removes the aggregate Protocol option.
		protocol: connectorProtocolFactory,
	});
});
