/**
 * @overview Internal proof-operation inputs for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcProofOperationKindEnum } from "@/enums/protocol/rpc-proof-operation-kind.enum";
import type {
	RpcFreshAccept,
	RpcFreshRequest,
	RpcJsonRecord,
	RpcResumeAccept,
	RpcResumeReject,
	RpcResumeRequest,
} from "@/types/protocol/rpc-wire-record.type";

export type RpcRandomCarrier = {
	readonly bytes: Uint8Array;
	readonly value: string;
};

export type SignRpcProofOptions<TKey> =
	| {
			readonly kind: RpcProofOperationKindEnum.freshAccept;
			readonly proofKey: TKey;
			readonly request: RpcFreshRequest;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind: RpcProofOperationKindEnum.resumeRequest;
			readonly proofKey: TKey;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind:
				| RpcProofOperationKindEnum.resumeAccept
				| RpcProofOperationKindEnum.resumeReject;
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind: RpcProofOperationKindEnum.genericReject;
			readonly request: RpcResumeRequest;
			readonly record: RpcJsonRecord;
	  };

export type VerifyRpcProofOptions<TKey> =
	| {
			readonly kind: RpcProofOperationKindEnum.freshAccept;
			readonly proofKey: TKey;
			readonly request: RpcFreshRequest;
			readonly record: RpcFreshAccept;
	  }
	| {
			readonly kind: RpcProofOperationKindEnum.resumeRequest;
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
	  }
	| {
			readonly kind: RpcProofOperationKindEnum.resumeAccept;
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcResumeAccept;
	  }
	| {
			readonly kind: RpcProofOperationKindEnum.resumeReject;
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcResumeReject;
	  };
