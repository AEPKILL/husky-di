/**
 * @overview Private RPC Peer contract used by Topology Owner implementations.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolSession,
	RpcProtocolIncomingCallReservation,
	RpcProtocolIncomingStreamReservation,
	RpcProtocolStreamRequest,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcPeer } from "@/interfaces/rpc-caller.interface";
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
		member: string,
		args: IRpcApplicationArgumentsSnapshot,
	): IRpcPeerInvocationReservation | undefined;
	reserveIncomingProtocolCall(
		request: IRpcProtocolIncomingCallRequest,
	): RpcProtocolIncomingCallReservation | undefined;
	reserveIncomingProtocolStream(
		request: RpcProtocolStreamRequest,
	): RpcProtocolIncomingStreamReservation | undefined;
	attachProtocolSession(session: IRpcProtocolSession): boolean;
	readonly localExposureRegistry: RpcExposureRegistry;
}
