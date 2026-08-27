/**
 * @overview Private RPC Peer runtime and invocation contracts used by Topology Owners.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerCallEvent } from "@/types/peer/rpc-peer-call-event.type";
import type { RpcPeerState } from "@/types/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/rpc-exposure.type";

export interface IRpcPeerCommittedInvocation {
	readonly result: Promise<unknown>;
	start(): void;
	cancel(): void;
}

export interface IRpcPeerInvocationReservation {
	commit(): IRpcPeerCommittedInvocation;
	release(): void;
}

export interface IRpcPeerRuntime extends IRpcPeer {
	commitState(state: RpcPeerState): void;
	stageState(state: RpcPeerState): void;
	flushState(): void;
	completeState(): void;
	reserveOutgoingProtocolInvocation(
		service: string,
		method: string,
		args: IRpcApplicationArgumentsSnapshot,
	): IRpcPeerInvocationReservation | undefined;
	reserveIncomingProtocolCall(
		request: IRpcProtocolIncomingCallRequest,
	): RpcProtocolIncomingCallReservation | undefined;
	attachProtocolSession(session: IRpcProtocolSession): boolean;
	readonly localExposureRegistry: RpcExposureRegistry;
}

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
