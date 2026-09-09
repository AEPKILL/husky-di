/**
 * @overview Private sequenced delivery, replay scheduling, and receipt acknowledgment ownership.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { IRpcCodec } from "@/modules/protocol/interfaces/rpc-codec.interface";
import type {
	IRpcReplayReservation,
	IRpcSessionCallRetention,
} from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type { IRpcSessionConnection } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type { IRpcSessionInvocations } from "@/modules/protocol/interfaces/rpc-session-invocations.interface";
import type {
	RpcMessageEnvelope,
	RpcSemanticMessage,
} from "@/modules/protocol/types/rpc-wire-record.type";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export interface IRpcSessionDelivery {
	readonly highestSentSequence: number;
	readonly receivedThrough: number;
	readonly peerReceivedThrough: number;
	readonly hasUnsettled: boolean;
	receiveEnvelope(envelope: RpcMessageEnvelope): boolean;
	acknowledge(ackThrough: number): boolean;
	queueReplay(replay: IRpcReplayReservation): void;
	queueSemantic(message: RpcSemanticMessage): boolean;
	resumeReplay(peerReceivedThrough: number): void;
	pump(): void;
	/** Cancels delayed ACK work before terminal callbacks can reenter. */
	stop(): void;
	terminate(): void;
}

export type RpcSessionDeliveryFactory = (options: {
	readonly codec: IRpcCodec;
	readonly retention: IRpcSessionCallRetention;
	readonly invocations: IRpcSessionInvocations;
	readonly ackDelayMs: number;
	readonly counterExhausted?: boolean;
	readonly isClosed: () => boolean;
	readonly getBinding: () => IRpcSessionConnection | undefined;
	readonly onMessage: (message: RpcSemanticMessage) => void;
	readonly onDrained: () => void;
	readonly onCounterExhausted: () => void;
	readonly onTerminate: (cause: Error) => void;
	readonly onFault: (
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		cause: Error,
	) => void;
	readonly onSendFailure: (cause: Error) => void;
}) => IRpcSessionDelivery;
