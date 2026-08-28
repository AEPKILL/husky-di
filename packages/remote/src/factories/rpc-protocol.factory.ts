/**
 * @overview Assembles the immutable built-in Protocol from replaceable internal implementations.
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
	RpcProtocolAcceptorRuntimeImpl,
	RpcProtocolConnectorRuntimeImpl,
} from "@/impls/protocol/rpc-protocol.impl";
import { RpcSessionImpl } from "@/impls/session/rpc-session.impl";
import type {
	CreateRpcEndpointOptions,
	IRpcEndpoint,
} from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcProtocol } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcSessionFactory } from "@/interfaces/session/rpc-session.interface";
import { createRpcSecurityCarrier } from "@/utils/protocol/rpc-base64-url-32-schema.util";

/** Returns the immutable built-in Protocol for independent providers. */
export function createRpcProtocol(): IRpcProtocol {
	return protocol;
}

/** Returns a package-private real-ledger counter exhaustion fixture. */
export function createRpcCounterExhaustionProtocolForTest(): IRpcProtocol {
	return createBuiltInRpcProtocol(true);
}

const codec = Object.freeze(new RpcCodecImpl());

const createEndpoint = (options: CreateRpcEndpointOptions): IRpcEndpoint =>
	new RpcEndpointImpl(options);

function createBuiltInRpcProtocol(counterExhausted: boolean): IRpcProtocol {
	const createSession: RpcSessionFactory = (options) =>
		new RpcSessionImpl(options, {
			codec,
			counterExhausted,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				options.host.policy.maxRetainedBytesPerSession,
			),
		});

	return Object.freeze({
		createConnector: (host) => {
			const bindings = new RpcConnectorBindingsImpl({ host, createEndpoint });
			return new RpcProtocolConnectorRuntimeImpl(
				host,
				codec,
				bindings,
				createSession,
			);
		},
		createAcceptor: (host) => {
			const bindings = new RpcAcceptorBindingsImpl({ host, createEndpoint });
			return new RpcProtocolAcceptorRuntimeImpl(
				host,
				codec,
				createRpcSecurityCarrier,
				bindings,
				createSession,
			);
		},
	} satisfies IRpcProtocol);
}

const protocol = createBuiltInRpcProtocol(false);
