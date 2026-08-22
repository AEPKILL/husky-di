/**
 * @overview Private retained Session contract used by the built-in Protocol runtimes.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcBindingCandidate,
	RpcBindingCommit,
	RpcContinuityCandidate,
	RpcInitiatorBindingPreparation,
	RpcInitiatorResume,
	RpcInitiatorResumeAccept,
	RpcResponderProof,
	RpcResponderResumeRequest,
	RpcResponderResumeReview,
	RpcSessionAuthorityCommit,
	RpcSessionRecovery,
} from "@/types/protocol/rpc-session.type";

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
