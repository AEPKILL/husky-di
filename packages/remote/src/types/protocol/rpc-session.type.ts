/**
 * @overview Internal Session creation inputs for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type { IRpcProtocolHost } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcSession } from "@/interfaces/protocol/rpc-session.interface";

export type CreateRpcSessionOptions<TKey> = {
	readonly host: IRpcProtocolHost;
	readonly sessionId: string;
	readonly proofKey: TKey;
	readonly codec: IRpcCodec;
	readonly onTerminal: (session: IRpcSession<TKey>) => void;
	readonly counterExhausted?: boolean;
};
