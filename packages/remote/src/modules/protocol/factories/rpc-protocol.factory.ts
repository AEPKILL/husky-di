/**
 * @overview Assembles fresh owner-scoped built-in Protocol roles.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcCodecImpl } from "@/modules/protocol/impls/rpc-codec.impl";
import { RpcProtocolAcceptorImpl } from "@/modules/protocol/impls/rpc-protocol-acceptor.impl";
import { RpcProtocolConnectorImpl } from "@/modules/protocol/impls/rpc-protocol-connector.impl";
import { RpcSessionImpl } from "@/modules/protocol/impls/rpc-session.impl";
import { RpcSessionActivityImpl } from "@/modules/protocol/impls/rpc-session-activity.impl";
import { RpcSessionCallRetentionImpl } from "@/modules/protocol/impls/rpc-session-call-retention.impl";
import { RpcSessionConnectionImpl } from "@/modules/protocol/impls/rpc-session-connection.impl";
import { RpcSessionContinuityImpl } from "@/modules/protocol/impls/rpc-session-continuity.impl";
import { RpcSessionDeliveryImpl } from "@/modules/protocol/impls/rpc-session-delivery.impl";
import { RpcSessionIncomingCallsImpl } from "@/modules/protocol/impls/rpc-session-incoming-calls.impl";
import { RpcSessionInvocationsImpl } from "@/modules/protocol/impls/rpc-session-invocations.impl";
import { RpcSessionShutdownImpl } from "@/modules/protocol/impls/rpc-session-shutdown.impl";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcSession,
	RpcSessionFactory,
} from "@/modules/protocol/interfaces/rpc-session.interface";
import type { RpcSessionActivityFactory } from "@/modules/protocol/interfaces/rpc-session-activity.interface";
import type { RpcSessionCallRetentionFactory } from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type { RpcSessionConnectionFactory } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type { RpcSessionContinuityFactory } from "@/modules/protocol/interfaces/rpc-session-continuity.interface";
import type { RpcSessionDeliveryFactory } from "@/modules/protocol/interfaces/rpc-session-delivery.interface";
import type { RpcSessionIncomingCallsFactory } from "@/modules/protocol/interfaces/rpc-session-incoming-calls.interface";
import type { RpcSessionInvocationsFactory } from "@/modules/protocol/interfaces/rpc-session-invocations.interface";
import type { RpcSessionShutdownFactory } from "@/modules/protocol/interfaces/rpc-session-shutdown.interface";
import { createRpcSecurityCarrier } from "@/modules/protocol/utils/rpc-base64-url-32-schema.util";
import { RpcRetainedBytesLedgerImpl } from "@/shared/impls/rpc-retained-bytes-ledger.impl";

/** Creates a fresh built-in Connector Protocol role for one owner. */
export function createRpcProtocolConnector(
	host: IRpcProtocolConnectorHost,
): IRpcProtocolConnector {
	return createBuiltInRpcProtocolConnector(host, false);
}

/** Creates a fresh built-in Acceptor Protocol role for one owner. */
export function createRpcProtocolAcceptor(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolAcceptor {
	return createBuiltInRpcProtocolAcceptor(host, false);
}

/** Creates a package-private Connector counter-exhaustion fixture. */
export function createRpcCounterExhaustionProtocolConnectorForTest(
	host: IRpcProtocolConnectorHost,
): IRpcProtocolConnector {
	return createBuiltInRpcProtocolConnector(host, true);
}

/** Creates a package-private Acceptor counter-exhaustion fixture. */
export function createRpcCounterExhaustionProtocolAcceptorForTest(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolAcceptor {
	return createBuiltInRpcProtocolAcceptor(host, true);
}

/** Binds built-in Session dependencies for one Protocol role. */
export function createBuiltInRpcSessionFactory(
	counterExhausted: boolean,
): RpcSessionFactory {
	return (options): IRpcSession =>
		new RpcSessionImpl(options, {
			codec,
			createActivity: createRpcSessionActivity,
			createShutdown: createRpcSessionShutdown,
			createDelivery: createRpcSessionDelivery,
			createContinuity: createRpcSessionContinuity,
			createConnection: createRpcSessionConnection,
			createCallRetention: createRpcSessionCallRetention,
			createIncomingCalls: createRpcSessionIncomingCalls,
			createInvocations: createRpcSessionInvocations,
			counterExhausted,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				options.host.policy.maxRetainedBytesPerSession,
			),
		});
}

export const createRpcSessionActivity: RpcSessionActivityFactory = (options) =>
	new RpcSessionActivityImpl(options);

export const createRpcSessionCallRetention: RpcSessionCallRetentionFactory = (
	options,
) => new RpcSessionCallRetentionImpl(options);

export const createRpcSessionIncomingCalls: RpcSessionIncomingCallsFactory = (
	options,
) => new RpcSessionIncomingCallsImpl(options);

export const createRpcSessionInvocations: RpcSessionInvocationsFactory = (
	options,
) => new RpcSessionInvocationsImpl(options);

export const createRpcSessionConnection: RpcSessionConnectionFactory = (
	options,
) => new RpcSessionConnectionImpl(options);

export const createRpcSessionContinuity: RpcSessionContinuityFactory = (
	options,
) => new RpcSessionContinuityImpl(options);

export const createRpcSessionDelivery: RpcSessionDeliveryFactory = (options) =>
	new RpcSessionDeliveryImpl(options);

export const createRpcSessionShutdown: RpcSessionShutdownFactory = (options) =>
	new RpcSessionShutdownImpl(options);

const codec = Object.freeze(new RpcCodecImpl());

function createBuiltInRpcProtocolConnector(
	host: IRpcProtocolConnectorHost,
	counterExhausted: boolean,
): IRpcProtocolConnector {
	return new RpcProtocolConnectorImpl({
		host,
		codec,
		createSession: createBuiltInRpcSessionFactory(counterExhausted),
	});
}

function createBuiltInRpcProtocolAcceptor(
	host: IRpcProtocolAcceptorHost,
	counterExhausted: boolean,
): IRpcProtocolAcceptor {
	return new RpcProtocolAcceptorImpl({
		host,
		codec,
		createSecurityCarrier: createRpcSecurityCarrier,
		createSession: createBuiltInRpcSessionFactory(counterExhausted),
	});
}
