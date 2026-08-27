/**
 * @overview Private RPC Peer implementation construction inputs.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerCallEvent } from "@/types/peer/rpc-peer-call-event.type";
import type { RpcPeerState } from "@/types/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/rpc-exposure.type";

export type CreateRpcPeerOptions = Readonly<{
	readonly initialState: RpcPeerState;
	readonly ownerExposureRegistry: RpcExposureRegistry;
	readonly isOwnerActive: () => boolean;
	readonly emitEvent: (event: RpcPeerCallEvent) => void;
	readonly onProtocolFault: (error: Error) => void;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly maximumIncomingBytes: number;
	readonly reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}>;

export type RpcPeerFactory = (options: CreateRpcPeerOptions) => IRpcPeerRuntime;
