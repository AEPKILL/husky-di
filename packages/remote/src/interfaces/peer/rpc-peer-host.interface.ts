/**
 * @overview Private RPC Peer host contract used by Topology Owners.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import type { Observable } from "rxjs";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcProtocolCallRequest,
	RpcProtocolIncomingCallReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";

export type RpcPeerStateView = Readonly<{
	readonly readState: () => RpcPeerState;
	readonly state$: Observable<RpcPeerState>;
}>;

export interface IRpcPeerHost {
	readonly peer: IRpcPeer;
	reserveIncomingCall(
		request: IRpcProtocolCallRequest,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): boolean;
	hasLocalExposure(wireName: string): boolean;
}
