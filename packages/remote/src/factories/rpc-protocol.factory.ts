/**
 * @overview Assembles the immutable built-in Protocol from replaceable internal implementations.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcBindingAttemptImpl } from "@/impls/protocol/rpc-binding-attempt.impl";
import { RpcCodecImpl } from "@/impls/protocol/rpc-codec.impl";
import { RpcCryptographyImpl } from "@/impls/protocol/rpc-cryptography.impl";
import { RpcEndpointImpl } from "@/impls/protocol/rpc-endpoint.impl";
import { RpcProtocolImpl } from "@/impls/protocol/rpc-protocol.impl";
import { RpcRetainedBytesLedgerImpl } from "@/impls/protocol/rpc-retained-bytes-ledger.impl";
import { RpcSessionImpl } from "@/impls/protocol/rpc-session.impl";
import type { IRpcProtocol } from "@/interfaces/protocol/rpc-protocol.interface";
import type { CreateRpcProtocolOptions } from "@/types/protocol/rpc-protocol.type";

const codec = Object.freeze(new RpcCodecImpl());
const cryptography = Object.freeze(new RpcCryptographyImpl());

function createConfiguredRpcProtocol<TKey>(
	options: CreateRpcProtocolOptions<TKey>,
): IRpcProtocol {
	const snapshot = Object.freeze({ ...options });
	return Object.freeze(new RpcProtocolImpl(snapshot));
}

function createBuiltInRpcProtocol(counterExhausted: boolean): IRpcProtocol {
	return createConfiguredRpcProtocol({
		codec,
		cryptography,
		createEndpoint: (options) => new RpcEndpointImpl(options),
		createBindingAttempt: (options) => new RpcBindingAttemptImpl(options),
		createSession: (options) =>
			new RpcSessionImpl({
				...options,
				retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
					options.host.policy.maxRetainedBytesPerSession,
				),
			}),
		counterExhausted,
	});
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
