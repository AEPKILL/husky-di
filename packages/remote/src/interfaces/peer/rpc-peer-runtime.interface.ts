/**
 * @overview Private RPC Peer runtime contract used by Topology Owner implementations.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcPeerInvocationReservation } from "@/interfaces/peer/rpc-peer-invocation-reservation.interface";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolSession,
	RpcProtocolIncomingCallReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/rpc-exposure.type";

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
