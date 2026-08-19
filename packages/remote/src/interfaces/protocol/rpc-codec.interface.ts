/**
 * @overview Internal byte-to-record Codec seam for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	RpcDecodedRecord,
	RpcDecodePhase,
} from "@/types/protocol/rpc-codec.type";
import type { RpcJsonRecord } from "@/types/protocol/rpc-wire-record.type";

export interface IRpcCodec {
	encode(record: RpcJsonRecord): Uint8Array;
	decode<TPhase extends RpcDecodePhase>(
		bytes: Uint8Array,
		phase: TPhase,
	): RpcDecodedRecord<TPhase>;
}
