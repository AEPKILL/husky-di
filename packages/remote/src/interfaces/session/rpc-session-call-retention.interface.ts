/**
 * @overview Private ownership of incoming terminal evidence and replay retention.
 * @author AEPKILL
 * @created 2026-09-05 15:00:00
 */

import type { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolIncomingCall,
	IRpcProtocolRuntimePolicy,
	IRpcRetainedBytesReservation,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcSemanticMessage } from "@/types/protocol/rpc-wire-record.type";

/** A local payload lease; commit transfers custody to retained replay. */
export interface IRpcReplayReservation {
	readonly message: RpcSemanticMessage;
	release(): void;
}

/** A selected terminal owns its fallback and the detached Framework publication. */
export interface IRpcRetainedTerminal {
	/** Undefined means even the protected terminal reserve was exhausted. */
	readonly replay: IRpcReplayReservation | undefined;
	publish(): void;
}

export interface IRpcRetainedIncomingCall {
	/** Attach exactly once before selecting completion; a commit returning after close is finished immediately. */
	attach(call: IRpcProtocolIncomingCall): void;
	selectCompletion(
		outcome:
			| RpcHandlerOutcome
			| Exclude<
					RpcIncomingTerminal,
					{ type: RpcCallTerminalTypeEnum.sessionTerminated }
			  >,
	): IRpcRetainedTerminal | undefined;
}

export interface IRpcSessionCallRetention {
	readonly incomingCount: number;
	readonly hasActiveIncoming: boolean;
	readonly replayCount: number;
	readonly hasReplayBarrier: boolean;
	retainIncoming(
		callId: string,
		terminalOnClose:
			| { readonly type: RpcCallTerminalTypeEnum.sessionTerminated }
			| {
					readonly type: RpcCallTerminalTypeEnum.failed;
					readonly code: RpcUnknownCallFailure;
			  },
	): IRpcRetainedIncomingCall;
	/** Retains a capacity rejection with no Framework work or publication. */
	rejectIncoming(callId: string): IRpcRetainedTerminal;
	cancelIncoming(callId: string): IRpcRetainedTerminal | undefined;
	reserveReplay(message: RpcSemanticMessage): IRpcReplayReservation | undefined;
	commitReplay(sequence: number, replay: IRpcReplayReservation): void;
	acknowledge(ackThrough: number): void;
	/** Applies the validated cursor and captures its finite replay set atomically. */
	resumeReplay(peerReceivedThrough: number): void;
	takeReplay():
		| Readonly<{ sequence: number; message: RpcSemanticMessage }>
		| undefined;
	terminateIncoming(): void;
	/** Releases committed replay; callers still own their uncommitted leases. */
	releaseReplay(): void;
}

export type RpcSessionCallRetentionFactory = (options: {
	readonly codec: IRpcCodec;
	readonly policy: Pick<
		IRpcProtocolRuntimePolicy,
		"maxPendingInvocationsPerSession" | "maxRetainedBytesPerSession"
	>;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}) => IRpcSessionCallRetention;
