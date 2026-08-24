/**
 * @overview Private RPC Peer implementation construction inputs.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcApplicationWorkReservation } from "@/interfaces/rpc-application-work-ledger.interface";
import type { RpcEvent } from "@/interfaces/rpc-caller.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/rpc-handler-scheduler.interface";
import type { IRpcPeerRuntime } from "@/interfaces/rpc-peer.interface";
import type { RpcPeerState } from "@/types/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/rpc-exposure.type";

export type CreateRpcPeerOptions = Readonly<{
	readonly initialState: RpcPeerState;
	readonly ownerExposureRegistry: RpcExposureRegistry;
	readonly isOwnerActive: () => boolean;
	readonly emitEvent: (event: RpcEvent) => void;
	readonly onProtocolFault: (error: Error) => void;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly maximumActiveStreamsPerSession: number;
	readonly maximumApplicationWorkPerSession: number;
	readonly maximumIncomingBytes: number;
	readonly reserveLocalApplicationWork: (
		stream: boolean,
	) => IRpcApplicationWorkReservation | undefined;
	readonly reserveRemoteApplicationWork: (
		stream: boolean,
	) => IRpcApplicationWorkReservation | undefined;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}>;

export type RpcPeerFactory = (options: CreateRpcPeerOptions) => IRpcPeerRuntime;
