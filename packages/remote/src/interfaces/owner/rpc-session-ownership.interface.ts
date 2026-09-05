/**
 * @overview Private role-specific ownership seams between Logical Sessions and stable RPC Peers.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcExposure } from "@/types/common/rpc-exposure.type";

export type RpcOwnerCloseReason =
	| RpcCloseReasonEnum.gracefulShutdown
	| RpcCloseReasonEnum.forcedClose
	| RpcCloseReasonEnum.shutdownDeadline;

export type RpcSessionPeerEnvironment = Readonly<{
	readonly findOwnerExposure: (wireName: string) => RpcExposure | undefined;
	readonly isOwnerActive: () => boolean;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly maximumIncomingBytes: number;
	readonly reserveOwnerRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}>;

export interface IRpcConnectorSessionOwnership {
	readonly peer: IRpcPeer;
	readonly attached: boolean;
	attach(
		session: IRpcProtocolSession,
	): IRpcConnectorSessionAttachment | undefined;
	beginGracefulShutdown(): void;
	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}

export interface IRpcConnectorSessionAttachment {
	readonly host: IRpcProtocolSessionHost;
	readonly active: boolean;
	activate(canActivate: () => boolean): boolean;
	discard(): void;
}

export interface IRpcAcceptorSessionOwnership {
	admit(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined;
	hasLocalExposure(wireName: string): boolean;
	beginGracefulShutdown(): void;
	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}
