/**
 * @overview Internal construction options for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type { IRpcCryptography } from "@/interfaces/protocol/rpc-cryptography.interface";
import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";
import type { CreateRpcEndpointOptions } from "@/types/protocol/rpc-endpoint.type";
import type { CreateRpcSessionOptions } from "@/types/protocol/rpc-session.type";

export type CreateRpcProtocolOptions<TKey> = {
	readonly codec: IRpcCodec;
	readonly cryptography: IRpcCryptography<TKey>;
	readonly createEndpoint: (options: CreateRpcEndpointOptions) => IRpcEndpoint;
	readonly createSession: (
		options: CreateRpcSessionOptions<TKey>,
	) => IRpcSession<TKey>;
	readonly counterExhausted?: boolean | undefined;
};
