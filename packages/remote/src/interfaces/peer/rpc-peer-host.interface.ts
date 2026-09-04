/**
 * @overview Private RPC Peer host and construction contracts used by Topology Owners.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import type { Observable } from "rxjs";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type { RpcExposure } from "@/types/common/rpc-exposure.type";
import type { RpcCallEventSink } from "@/types/peer/rpc-peer-call-event.type";

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

export type RpcPeerFactory = (
	options: RpcPeerStateView &
		Readonly<{
			readonly getSession: () => IRpcProtocolSession | undefined;
			readonly findOwnerExposure: (wireName: string) => RpcExposure | undefined;
			readonly isOwnerActive: () => boolean;
			readonly callEventSink: RpcCallEventSink;
			readonly onProtocolFault: (error: Error) => void;
			readonly handlerScheduler: IRpcHandlerScheduler;
			readonly maximumIncomingBytes: number;
			readonly reserveRetainedBytes: (
				bytes: number,
			) => IRpcRetainedBytesReservation | undefined;
		}>,
) => IRpcPeerHost;
