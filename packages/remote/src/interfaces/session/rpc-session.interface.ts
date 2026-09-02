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

export interface IRpcSession extends IRpcProtocolSession {
	readonly sessionId: string;
	readonly recovery: RpcSessionRecovery | undefined;
	prepareFreshBinding(host: IRpcProtocolSessionHost): RpcBindingCandidate;
	beginInitiatorResume(): RpcInitiatorResume;
	prepareInitiatorBinding(
		resume: RpcInitiatorResume,
		accept: RpcInitiatorResumeAccept,
	): RpcInitiatorBindingPreparation;
	reviewResponderResume(
		request: RpcResponderResumeRequest,
	): RpcResponderResumeReview;
	commitContinuityFailure(
		candidate: RpcContinuityCandidate | RpcInitiatorResume,
		cause?: Error,
	): RpcSessionAuthorityCommit;
	terminateRemoteResume(
		resume: RpcInitiatorResume,
		cause?: Error,
	): RpcSessionAuthorityCommit;
	terminateForced(): void;
	commitBinding(
		candidate: RpcBindingCandidate,
		endpoint: IRpcEndpoint,
	): RpcBindingCommit;
	shutdown(): Promise<void>;
}

export type RpcSessionFactory = (
	options: Readonly<{
		readonly host: IRpcProtocolHost;
		readonly sessionId: string;
		readonly resumeToken: string;
		readonly onTerminal: () => void;
	}>,
) => IRpcSession;

export type RpcSessionRecovery = Readonly<{
	readonly reclaimDeadline: number;
}>;

export type RpcBindingCandidate = Readonly<{
	readonly rpcBindingCandidateType: unique symbol;
}>;

export type RpcInitiatorResume = Readonly<{
	readonly sessionId: string;
	readonly resumeToken: string;
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

export type RpcContinuityCandidate = Readonly<{
	readonly rpcContinuityCandidateType: unique symbol;
}>;

export type RpcInitiatorBindingPreparation =
	| (RpcBindingCandidate &
			Readonly<{
				readonly kind: "ready";
			}>)
	| (RpcContinuityCandidate &
			Readonly<{
				readonly kind: "contradiction";
			}>)
	| Readonly<{
			readonly kind: "stale";
			readonly error: Error;
	  }>;
export type RpcResponderResumeRequest = Readonly<{
	readonly resumeToken: string;
	readonly resumeAttempt: number;
	readonly peerReceivedThrough: number;
}>;

export type RpcResponderResumeReview =
	| Readonly<{ readonly kind: "generic-reject" }>
	| (RpcContinuityCandidate &
			Readonly<{
				readonly kind: "continuity-reject";
			}>)
	| (RpcBindingCandidate &
			Readonly<{
				readonly kind: "accept";
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
