/**
 * @overview Assembles the immutable built-in Protocol from replaceable internal implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcBindingAttemptImpl } from "@/impls/endpoint/rpc-binding-attempt.impl";
import { RpcEndpointImpl } from "@/impls/endpoint/rpc-endpoint.impl";
import { RpcCodecImpl } from "@/impls/protocol/rpc-codec.impl";
import { RpcHandshakeCryptographyImpl } from "@/impls/protocol/rpc-handshake-cryptography.impl";
import {
	RpcProtocolAcceptorRuntimeImpl,
	RpcProtocolConnectorRuntimeImpl,
} from "@/impls/protocol/rpc-protocol.impl";
import { RpcSessionImpl } from "@/impls/session/rpc-session.impl";
import type { RpcBindingAttemptFactory } from "@/interfaces/endpoint/rpc-binding-attempt.interface";
import type {
	CreateRpcEndpointOptions,
	IRpcEndpoint,
} from "@/interfaces/endpoint/rpc-endpoint.interface";
import type { IRpcProtocol } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcSessionFactory } from "@/interfaces/session/rpc-session.interface";

const codec = Object.freeze(new RpcCodecImpl());
const handshakeCryptography = Object.freeze(new RpcHandshakeCryptographyImpl());

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
				handshakeCryptography,
				createBindingAttempt,
				createSession,
			),
		createAcceptor: (host) =>
			new RpcProtocolAcceptorRuntimeImpl<CryptoKey>(
				host,
				codec,
				handshakeCryptography,
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
