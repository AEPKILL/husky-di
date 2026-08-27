/**
 * @overview Assembles the immutable built-in Protocol from replaceable internal implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcBindingAttemptImpl } from "@/impls/protocol/rpc-binding-attempt.impl";
import { RpcCodecImpl } from "@/impls/protocol/rpc-codec.impl";
import { RpcCryptographyImpl } from "@/impls/protocol/rpc-cryptography.impl";
import { RpcEndpointImpl } from "@/impls/protocol/rpc-endpoint.impl";
import {
	RpcProtocolAcceptorRuntimeImpl,
	RpcProtocolConnectorRuntimeImpl,
} from "@/impls/protocol/rpc-protocol.impl";
import { RpcRetainedBytesLedgerImpl } from "@/impls/protocol/rpc-retained-bytes-ledger.impl";
import { RpcSessionImpl } from "@/impls/protocol/rpc-session.impl";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcProtocol } from "@/interfaces/protocol/rpc-protocol.interface";
import type { CreateRpcEndpointOptions } from "@/types/protocol/rpc-endpoint.type";
import type {
	RpcBindingAttemptFactory,
	RpcSessionFactory,
} from "@/types/protocol/rpc-protocol.type";

const codec = Object.freeze(new RpcCodecImpl());
const cryptography = Object.freeze(new RpcCryptographyImpl());

const createEndpoint = (options: CreateRpcEndpointOptions): IRpcEndpoint =>
	new RpcEndpointImpl(options);

const createBindingAttempt: RpcBindingAttemptFactory<CryptoKey> = (options) =>
	new RpcBindingAttemptImpl<CryptoKey>({
		...options,
		createEndpoint,
	});

function createBuiltInRpcProtocol(counterExhausted: boolean): IRpcProtocol {
	const createSession: RpcSessionFactory<CryptoKey> = (options) =>
		new RpcSessionImpl<CryptoKey>(options, {
			codec,
			counterExhausted,
			retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
				options.host.policy.maxRetainedBytesPerSession,
			),
		});

	return Object.freeze({
		createConnector: (host) =>
			new RpcProtocolConnectorRuntimeImpl<CryptoKey>(
				host,
				codec,
				cryptography,
				createBindingAttempt,
				createSession,
			),
		createAcceptor: (host) =>
			new RpcProtocolAcceptorRuntimeImpl<CryptoKey>(
				host,
				codec,
				cryptography,
				createBindingAttempt,
				createSession,
			),
	} satisfies IRpcProtocol);
}

const protocol = createBuiltInRpcProtocol(false);

/** Returns the immutable built-in Protocol for independent providers. */
export function createRpcProtocol(): IRpcProtocol {
	return protocol;
}

/** Returns a package-private real-ledger counter exhaustion fixture. */
export function createRpcCounterExhaustionProtocolForTest(): IRpcProtocol {
	return createBuiltInRpcProtocol(true);
}
