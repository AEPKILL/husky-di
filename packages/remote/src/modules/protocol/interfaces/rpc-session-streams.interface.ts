/**
 * @overview Session-scoped stream admission, source lifetime, and terminal ownership.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 23:45:00
 */

import type {
	IRpcProtocolCallRequest,
	IRpcProtocolHost,
	IRpcProtocolInvocation,
	IRpcProtocolSessionHost,
	IRpcProtocolStreamObserver,
	IRpcRetainedBytesReservation,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type { IRpcSessionCallRetention } from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type { IRpcSessionDelivery } from "@/modules/protocol/interfaces/rpc-session-delivery.interface";
import type { RpcStreamSemanticMessage } from "@/modules/protocol/types/rpc-wire-record.type";

export interface IRpcSessionStreams {
	readonly hasActive: boolean;
	readonly incomingCount: number;
	readonly outgoingCount: number;
	readonly pendingBytes: number;
	prepare(
		request: IRpcProtocolCallRequest,
		observer: IRpcProtocolStreamObserver,
	): IRpcProtocolInvocation | undefined;
	receive(message: RpcStreamSemanticMessage): void;
	terminate(): void;
}

export type RpcSessionStreamsFactory = (options: {
	readonly host: IRpcProtocolHost;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	readonly retention: Pick<
		IRpcSessionCallRetention,
		"incomingCount" | "reserveReplay"
	>;
	readonly delivery: Pick<
		IRpcSessionDelivery,
		"queueReplay" | "queueSemantic" | "queueStream"
	>;
	readonly getHost: () => IRpcProtocolSessionHost | undefined;
	readonly isDraining: () => boolean;
	readonly getOutgoingCallCount: () => number;
	readonly getPendingCallBytes: () => number;
	readonly onRetired: () => void;
	readonly onFault: (error: Error) => void;
	readonly onCounterExhausted: () => void;
}) => IRpcSessionStreams;
