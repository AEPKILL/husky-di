/**
 * @overview Internal retained Session seam used by the built-in Protocol runtimes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcEndpoint } from "@/interfaces/protocol/rpc-endpoint.interface";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcEndpointFailure } from "@/types/protocol/rpc-endpoint.type";
import type { RpcPeerCursorClassification } from "@/types/protocol/rpc-session.type";

export interface IRpcSession<TKey> extends IRpcProtocolSession {
	readonly sessionId: string;
	readonly receivedThrough: number;
	readonly peerReceivedThrough: number;
	readonly highestSentSequence: number;
	readonly bindingEpoch: number;
	readonly proofKey: TKey | undefined;
	readonly isRecovering: boolean;
	readonly isClosed: boolean;
	readonly highestAcceptedResumeAttempt: number;
	ownsEndpoint(endpoint: IRpcEndpoint): boolean;
	consumeResumeAttempt(): number;
	classifyPeerCursor(cursor: number): RpcPeerCursorClassification;
	canAcceptResumeAttempt(resumeAttempt: number): boolean;
	acceptResumeBinding(
		endpoint: IRpcEndpoint,
		resumeAttempt: number,
		peerReceivedThrough: number,
	): number;
	terminateContinuityFailure(cause?: Error): void;
	terminateAuthenticatedRemote(cause?: Error): void;
	installHost(host: IRpcProtocolSessionHost): void;
	installBinding(
		endpoint: IRpcEndpoint,
		epoch: number,
		peerReceivedThrough: number,
	): void;
	activateBinding(): void;
	receive(endpoint: IRpcEndpoint, bytes: Uint8Array): void;
	endpointFailed(
		endpoint: IRpcEndpoint,
		reason: RpcEndpointFailure,
		error?: Error,
	): void;
	shutdown(): Promise<void>;
}
