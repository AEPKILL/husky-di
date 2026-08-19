/**
 * @overview Internal transcript-proof cryptography seam for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	RpcRandomCarrier,
	SignRpcProofOptions,
	VerifyRpcProofOptions,
} from "@/types/protocol/rpc-cryptography.type";
import type { RpcJsonRecord } from "@/types/protocol/rpc-wire-record.type";

export interface IRpcCryptography<TKey> {
	createRandomCarrier(): RpcRandomCarrier;
	decodeBase64Url32(value: string): Uint8Array;
	deriveProofKey(sessionSecret: Uint8Array, sessionId: string): Promise<TKey>;
	signProof(options: SignRpcProofOptions<TKey>): Promise<string>;
	verifyProof(options: VerifyRpcProofOptions<TKey>): Promise<boolean>;
	canonicalize(record: RpcJsonRecord): string;
}
