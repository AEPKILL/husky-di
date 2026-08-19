/**
 * @overview Internal proof-operation inputs for the built-in Protocol.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

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
			readonly kind: "fresh-accept";
			readonly proofKey: TKey;
			readonly request: RpcFreshRequest;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind: "resume-request";
			readonly proofKey: TKey;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind: "resume-accept" | "resume-reject";
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcJsonRecord;
	  }
	| {
			readonly kind: "generic-reject";
			readonly request: RpcResumeRequest;
			readonly record: RpcJsonRecord;
	  };

export type VerifyRpcProofOptions<TKey> =
	| {
			readonly kind: "fresh-accept";
			readonly proofKey: TKey;
			readonly request: RpcFreshRequest;
			readonly record: RpcFreshAccept;
	  }
	| {
			readonly kind: "resume-request";
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
	  }
	| {
			readonly kind: "resume-accept";
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcResumeAccept;
	  }
	| {
			readonly kind: "resume-reject";
			readonly proofKey: TKey;
			readonly request: RpcResumeRequest;
			readonly record: RpcResumeReject;
	  };
