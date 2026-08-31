/**
 * @overview Assembles fresh owner-scoped built-in Protocol roles.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import {
	RpcAcceptorBindingsImpl,
	RpcConnectorBindingsImpl,
} from "@/impls/endpoint/rpc-bindings.impl";
import { RpcEndpointImpl } from "@/impls/endpoint/rpc-endpoint.impl";
import { RpcCodecImpl } from "@/impls/protocol/rpc-codec.impl";
import {
	RpcProtocolAcceptorImpl,
	RpcProtocolConnectorImpl,
} from "@/impls/protocol/rpc-protocol.impl";
import { RpcSessionImpl } from "@/impls/session/rpc-session.impl";
import type {
	CreateRpcEndpointOptions,
	IRpcEndpoint,
} from "@/interfaces/endpoint/rpc-endpoint.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnector,
	IRpcProtocolConnectorHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcSessionFactory } from "@/interfaces/session/rpc-session.interface";
import { createRpcSecurityCarrier } from "@/utils/protocol/rpc-base64-url-32-schema.util";

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

const codec = Object.freeze(new RpcCodecImpl());

const createEndpoint = (options: CreateRpcEndpointOptions): IRpcEndpoint =>
	new RpcEndpointImpl(options);

function createBuiltInRpcProtocolConnector(
	host: IRpcProtocolConnectorHost,
	counterExhausted: boolean,
): IRpcProtocolConnector {
	const bindings = new RpcConnectorBindingsImpl({ host, createEndpoint });
	return new RpcProtocolConnectorImpl(
		host,
		codec,
		bindings,
		createRpcSessionFactory(counterExhausted),
	);
}

function createBuiltInRpcProtocolAcceptor(
	host: IRpcProtocolAcceptorHost,
	counterExhausted: boolean,
): IRpcProtocolAcceptor {
	const bindings = new RpcAcceptorBindingsImpl({ host, createEndpoint });
	return new RpcProtocolAcceptorImpl(
		host,
		codec,
		createRpcSecurityCarrier,
		bindings,
		createRpcSessionFactory(counterExhausted),
	);
}

function createRpcSessionFactory(counterExhausted: boolean): RpcSessionFactory {
	return (options) =>
		new RpcSessionImpl(options, {
			codec,
			counterExhausted,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				options.host.policy.maxRetainedBytesPerSession,
			),
		});
}
