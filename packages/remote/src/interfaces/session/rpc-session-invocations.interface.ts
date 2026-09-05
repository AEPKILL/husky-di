/**
 * @overview Private ownership of outgoing invocation admission, settlement, and retained payloads.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolHost,
	IRpcProtocolInvocation,
	IRpcProtocolRuntimePolicy,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcReplayReservation } from "@/interfaces/session/rpc-session-call-retention.interface";
import type {
	RpcErrorMessage,
	RpcResultMessage,
	RpcSemanticMessage,
} from "@/types/protocol/rpc-wire-record.type";

/** A synchronous send opportunity whose shared sequence is owned by the Session. */
export interface IRpcInvocationAdmission {
	readonly sequence: number;
	readonly ackThrough?: number;
	/** Commits the supplied replay pair and invokes send in the same synchronous frame. */
	commitAndSend(encoded: Uint8Array, replay: IRpcReplayReservation): void;
}

/** Retains outgoing work from identity-free preparation through authoritative retirement. */
export interface IRpcSessionInvocations {
	readonly hasPending: boolean;
	readonly hasActive: boolean;
	prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined;
	/** Preflights one Pending Invocation before committing its identity and sending synchronously. */
	admitNext(admission: IRpcInvocationAdmission): void;
	receiveTerminal(message: RpcResultMessage | RpcErrorMessage): void;
	rejectPending(): void;
	terminate(): void;
}

export type RpcSessionInvocationsFactory = (options: {
	readonly policy: Pick<
		IRpcProtocolRuntimePolicy,
		"maxPendingInvocationsPerSession" | "maxRetainedBytesPerSession"
	>;
	readonly codec: IRpcCodec;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly reserveReplay: (
		message: RpcSemanticMessage,
	) => IRpcReplayReservation | undefined;
	readonly normalizeApplicationValue: IRpcProtocolHost["normalizeApplicationValue"];
	readonly onReady: () => void;
	readonly onRetired: () => void;
	readonly onCancel: (callId: string) => void;
	readonly onFault: (
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		error: Error,
	) => void;
	readonly onCounterExhausted: () => void;
}) => IRpcSessionInvocations;
