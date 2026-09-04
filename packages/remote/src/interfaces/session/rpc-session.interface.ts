/**
 * @overview Private retained Logical Session seam and one-shot authority plans.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { RpcEndpointFailureEnum } from "@/enums/protocol/rpc-endpoint-failure.enum";
import type { IRpcEndpoint } from "@/interfaces/endpoint/rpc-endpoint.interface";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";

export interface IRpcSession extends IRpcProtocolSession {
	readonly sessionId: string;
	readonly reclaimDeadline: number | undefined;
	prepareFresh(host: IRpcProtocolSessionHost): IRpcBindingPlan;
	beginResume(): IRpcResumeAttempt;
	reviewResume(claim: RpcResumeClaim): RpcResumeDecision;
	terminateForced(): void;
	shutdown(): Promise<void>;
}

export interface IRpcBindingPlan {
	install(endpoint: IRpcEndpoint): IRpcSessionBinding;
}

export interface IRpcResumeAttempt {
	readonly sessionId: string;
	readonly token: string;
	readonly attempt: number;
	readonly cursor: number;
	review(outcome: RpcResumeOutcome): RpcResumeDecision;
}

export interface IRpcSessionBinding {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	receive(bytes: Uint8Array): void;
	fail(reason: RpcEndpointFailureEnum, error?: Error): void;
	activate(): boolean;
}

export interface IRpcSessionTerminationPlan {
	commit(cause?: Error): void;
}

export type RpcResumeClaim = Readonly<{
	readonly token: string;
	readonly attempt: number;
	readonly cursor: number;
}>;

export type RpcResumeOutcome =
	| Readonly<{
			readonly kind: "accepted";
			readonly profile: string;
			readonly sessionId: string;
			readonly bindingEpoch: number;
			readonly cursor: number;
	  }>
	| Readonly<{ readonly kind: "rejected" }>
	| Readonly<{ readonly kind: "continuity-failure" }>
	| Readonly<{ readonly kind: "terminated" }>;

export type RpcResumeDecision =
	| Readonly<{
			readonly kind: "bind";
			readonly plan: IRpcBindingPlan;
			readonly bindingEpoch: number;
			readonly cursor: number;
	  }>
	| Readonly<{
			readonly kind: "terminate";
			readonly plan: IRpcSessionTerminationPlan;
	  }>
	| Readonly<{
			readonly kind: "reject";
			readonly error: Error;
	  }>;
