/**
 * @overview Private Logical Session candidates and exact Binding Epoch capabilities.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolHost,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";

export type CreateRpcSessionOptions<TKey> = {
	readonly host: IRpcProtocolHost;
	readonly sessionId: string;
	readonly proofKey: TKey;
	readonly codec: IRpcCodec;
	readonly onTerminal: () => void;
	readonly counterExhausted?: boolean;
};

export type RpcSessionRecovery = Readonly<{
	readonly reclaimDeadline: number;
}>;

export type RpcBindingCandidate<TKey> = Readonly<{
	readonly rpcBindingCandidateType: unique symbol;
	readonly rpcBindingCandidateKey: TKey;
}>;

export type RpcInitiatorResume<TKey> = Readonly<{
	readonly sessionId: string;
	readonly proofKey: TKey;
	readonly resumeAttempt: number;
	readonly receivedThrough: number;
	readonly rpcInitiatorResumeType: unique symbol;
}>;

export type RpcInitiatorResumeAccept = Readonly<{
	readonly profile: string;
	readonly sessionId: string;
	readonly bindingEpoch: number;
	readonly peerReceivedThrough: number;
}>;

export type RpcContinuityCandidate<TKey> = Readonly<{
	readonly rpcContinuityCandidateType: unique symbol;
	readonly rpcContinuityCandidateKey: TKey;
}>;

export type RpcInitiatorBindingPreparation<TKey> =
	| (RpcBindingCandidate<TKey> &
			Readonly<{
				readonly kind: "ready";
			}>)
	| (RpcContinuityCandidate<TKey> &
			Readonly<{
				readonly kind: "contradiction";
			}>)
	| Readonly<{
			readonly kind: "stale";
			readonly error: Error;
	  }>;

export type RpcResponderProof<TKey> = Readonly<{
	readonly proofKey: TKey;
	readonly rpcResponderProofType: unique symbol;
}>;

export type RpcResponderResumeRequest = Readonly<{
	readonly resumeAttempt: number;
	readonly peerReceivedThrough: number;
}>;

export type RpcResponderResumeReview<TKey> =
	| Readonly<{ readonly kind: "generic-reject" }>
	| (RpcContinuityCandidate<TKey> &
			Readonly<{
				readonly kind: "continuity-reject";
				readonly proofKey: TKey;
			}>)
	| (RpcBindingCandidate<TKey> &
			Readonly<{
				readonly kind: "accept";
				readonly proofKey: TKey;
				readonly bindingEpoch: number;
				readonly receivedThrough: number;
			}>);

export type RpcSessionAuthorityCommit =
	| Readonly<{ readonly kind: "committed" }>
	| Readonly<{
			readonly kind: "discarded";
			readonly error: Error;
	  }>;

export type RpcBindingEpoch = Readonly<{
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	receive(bytes: Uint8Array): void;
	failed(reason: RpcEndpointFailureEnum, error?: Error): void;
	activate(): boolean;
	readonly rpcBindingEpochType: unique symbol;
}>;

export type RpcBindingCommit =
	| Readonly<{
			readonly kind: "installed";
			readonly binding: RpcBindingEpoch;
	  }>
	| Readonly<{
			readonly kind: "discarded";
			readonly error: Error;
	  }>;
