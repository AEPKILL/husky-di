/**
 * @overview Compile-time Topology Owner factory and policy probes.
 * @author AEPKILL
 * @created 2026-08-26 15:07:19
 */

import { assertType, expectTypeOf, test } from "vitest";
import type * as PublicRemote from "../../src/index";
import {
	type CreateRpcReconnectionConnectorOptions,
	createRpcAcceptor,
	createRpcConnector,
	createRpcReconnectionConnector,
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
	type RpcInterceptor,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type { rpcConnectorConnectOptionsSchema } from "../../src/modules/owner";

declare const adapterFactory: RpcConnectorAdapterFactory;
declare const connectorProtocolFactory: RpcProtocolConnectorFactory;
declare const acceptorProtocolFactory: RpcProtocolAcceptorFactory;
declare const interceptor: RpcInterceptor;

test("RPC-PKG-003 keeps Owner termination lifetime and assembly private", () => {
	// @ts-expect-error The Owner request view is a private behavioral collaborator.
	type MissingTermination = PublicRemote.IRpcOwnerTermination;
	void (null as unknown as MissingTermination);
	// @ts-expect-error Winning transaction capabilities are not application API.
	type MissingTerminationLifecycle = PublicRemote.IRpcOwnerTerminationLifecycle;
	void (null as unknown as MissingTerminationLifecycle);
	// @ts-expect-error Termination implementation remains package-private.
	type MissingTerminationImpl = PublicRemote.RpcOwnerTerminationImpl;
	void (null as unknown as MissingTerminationImpl);
	type MissingTerminationCreator =
		// @ts-expect-error Owner termination creation is not a public extension point.
		typeof PublicRemote.createRpcOwnerTermination;
	void (null as unknown as MissingTerminationCreator);
	type MissingTerminationFactory =
		// @ts-expect-error Protocol extensions cannot replace Framework termination.
		import("../../src/protocol").RpcOwnerTerminationFactory;
	void (null as unknown as MissingTerminationFactory);
	type MissingTerminationOptions =
		// @ts-expect-error Protocol extensions cannot construct Framework termination.
		import("../../src/protocol").CreateRpcOwnerTerminationOptions;
	void (null as unknown as MissingTerminationOptions);
});

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
	const reconnectionOptions: CreateRpcReconnectionConnectorOptions = {
		protocolFactory: connectorProtocolFactory,
		runtimePolicy: { maxHandlersPerSession: 2 },
		interceptor,
		adapterFactory,
		policy: { retryDelaysMs: [0, 100], attemptTimeoutMs: 1_000 },
	};
	const reconnection = createRpcReconnectionConnector(reconnectionOptions);

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
		CreateRpcReconnectionConnectorOptions["protocolFactory"]
	>().toEqualTypeOf<RpcConnectorOptions["protocolFactory"]>();
	expectTypeOf<
		CreateRpcReconnectionConnectorOptions["runtimePolicy"]
	>().toEqualTypeOf<RpcConnectorOptions["runtimePolicy"]>();
	expectTypeOf<
		CreateRpcReconnectionConnectorOptions["interceptor"]
	>().toEqualTypeOf<RpcConnectorOptions["interceptor"]>();
	expectTypeOf<
		CreateRpcReconnectionConnectorOptions["adapterFactory"]
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
	createRpcReconnectionConnector({
		adapterFactory,
		policy: {
			// @ts-expect-error RPC-RECONNECT-001 closes the policy schema.
			unknown: true,
		},
	});
});

test("RPC-RECONNECT-001 creates its Connector instead of accepting one", () => {
	createRpcReconnectionConnector({
		adapterFactory,
		// @ts-expect-error RPC-RECONNECT-001 creates its own Connector.
		connector,
	});
	type MissingReconnectionCreator =
		// @ts-expect-error RPC-RECONNECT-001 replaces the former factory name.
		typeof PublicRemote.createRpcConnectorReconnection;
	void (null as unknown as MissingReconnectionCreator);
	type MissingReconnectionOptions =
		// @ts-expect-error RPC-RECONNECT-001 replaces the former factory options.
		PublicRemote.CreateRpcConnectorReconnectionOptions;
	void (null as unknown as MissingReconnectionOptions);
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

test("RPC-API-001 RPC-START-005 preserves the original Owner interface shapes", () => {
	expectTypeOf<keyof IRpcConnector>().toEqualTypeOf<
		"state" | "state$" | "event$" | "peer" | "connect" | "shutdown" | "close"
	>();
	expectTypeOf<keyof IRpcAcceptor>().toEqualTypeOf<
		| "state"
		| "state$"
		| "peers"
		| "peers$"
		| "event$"
		| "expose"
		| "listen"
		| "shutdown"
		| "close"
	>();
	expectTypeOf<IRpcConnector["connect"]>().toEqualTypeOf<
		(options: RpcConnectorConnectOptions) => Promise<void>
	>();
	expectTypeOf<RpcConnectorConnectOptions>().toEqualTypeOf<{
		readonly adapter: IRpcConnectorAdapter;
		readonly signal?: AbortSignal | undefined;
	}>();
	expectTypeOf<RpcConnectorConnectOptions>().toEqualTypeOf<
		Readonly<import("zod").input<typeof rpcConnectorConnectOptionsSchema>>
	>();
	expectTypeOf<IRpcConnector["shutdown"]>().toEqualTypeOf<
		() => Promise<void>
	>();
	expectTypeOf<IRpcConnector["close"]>().toEqualTypeOf<() => Promise<void>>();
	expectTypeOf<IRpcAcceptor["shutdown"]>().toEqualTypeOf<() => Promise<void>>();
	expectTypeOf<IRpcAcceptor["close"]>().toEqualTypeOf<() => Promise<void>>();
});
