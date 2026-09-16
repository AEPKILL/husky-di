/**
 * @overview Private RPC Peer host contract used by Topology Owners.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import type { Observable } from "rxjs";
import type { IRpcHandlerScheduler } from "@/modules/peer/interfaces/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type { RpcInterceptor } from "@/modules/peer/types/rpc-call-interceptor.type";
import type { RpcExposure } from "@/modules/peer/types/rpc-exposure.type";
import type { RpcCallEventSink } from "@/modules/peer/types/rpc-peer-call-event.type";
import type { RpcPeerState } from "@/modules/peer/types/rpc-peer-state.type";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingStream,
	IRpcProtocolSession,
	IRpcProtocolStreamObserver,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/modules/protocol";

export type RpcPeerStateView = Readonly<{
	readonly readState: () => RpcPeerState;
	readonly state$: Observable<RpcPeerState>;
}>;

/** Creates one stable Peer and its private incoming-call host. */
export type RpcPeerFactory = (
	options: RpcPeerStateView &
		Readonly<{
			readonly getSession: () => IRpcProtocolSession | undefined;
			readonly findOwnerExposure: (wireName: string) => RpcExposure | undefined;
			readonly isOwnerActive: () => boolean;
			readonly callEventSink: RpcCallEventSink;
			readonly interceptor?: RpcInterceptor;
			readonly onProtocolFault: (error: Error) => void;
			readonly handlerScheduler: IRpcHandlerScheduler;
			readonly maximumIncomingBytes: number;
			readonly reserveRetainedBytes: (
				bytes: number,
			) => IRpcRetainedBytesReservation | undefined;
		}>,
) => IRpcPeerHost;

export interface IRpcPeerHost {
	openIncomingStream?(
		request: IRpcProtocolCallRequest,
		observer: IRpcProtocolStreamObserver,
	): IRpcProtocolIncomingStream | undefined;
	readonly peer: IRpcPeer;
	reserveIncomingCall(
		request: IRpcProtocolCallRequest,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): boolean;
	hasLocalExposure(wireName: string): boolean;
}
