/**
 * @overview Private retained Logical Session seam, creation inputs, and capabilities.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type {
	IRpcProtocolHost,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";

export interface IRpcSession<TKey> extends IRpcProtocolSession {
	readonly sessionId: string;
	readonly recovery: RpcSessionRecovery | undefined;
	prepareFreshBinding(host: IRpcProtocolSessionHost): RpcBindingCandidate<TKey>;
	beginInitiatorResume(): RpcInitiatorResume<TKey>;
	confirmInitiatorResume(resume: RpcInitiatorResume<TKey>): boolean;
	prepareInitiatorBinding(
		resume: RpcInitiatorResume<TKey>,
		accept: RpcInitiatorResumeAccept,
	): RpcInitiatorBindingPreparation<TKey>;
	openResponderProof(): RpcResponderProof<TKey> | undefined;
	reviewResponderResume(
		proof: RpcResponderProof<TKey>,
		request: RpcResponderResumeRequest,
	): RpcResponderResumeReview<TKey>;
	commitContinuityFailure(
		candidate: RpcContinuityCandidate<TKey> | RpcInitiatorResume<TKey>,
		cause?: Error,
	): RpcSessionAuthorityCommit;
	terminateAuthenticatedRemote(
		resume: RpcInitiatorResume<TKey>,
		cause?: Error,
	): RpcSessionAuthorityCommit;
	terminateForced(): void;
	commitBinding(
		candidate: RpcBindingCandidate<TKey>,
		endpoint: IRpcEndpoint,
	): RpcBindingCommit;
	shutdown(): Promise<void>;
}

export type CreateRpcSessionOptions<TKey> = {
	readonly host: IRpcProtocolHost;
	readonly sessionId: string;
	readonly proofKey: TKey;
	readonly onTerminal: () => void;
};

export type RpcSessionFactory<TKey> = (
	options: CreateRpcSessionOptions<TKey>,
) => IRpcSession<TKey>;

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
