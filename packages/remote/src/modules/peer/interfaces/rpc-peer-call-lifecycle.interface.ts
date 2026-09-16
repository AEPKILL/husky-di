/**
 * @overview Private Framework call lifecycle and its dependency-neutral creation contract.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import type { Observable } from "rxjs";
import type { IRpcHandlerScheduler } from "@/modules/peer/interfaces/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type { RpcInterceptor } from "@/modules/peer/types/rpc-call-interceptor.type";
import type { RpcExposure } from "@/modules/peer/types/rpc-exposure.type";
import type { RpcCallEventSink } from "@/modules/peer/types/rpc-peer-call-event.type";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingStream,
	IRpcProtocolSession,
	IRpcProtocolStreamObserver,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/modules/protocol";

export interface IRpcPeerCallLifecycle {
	subscribe(
		service: string,
		method: string,
		actualArguments: readonly unknown[],
	): Observable<unknown>;
	openIncomingStream(
		request: IRpcProtocolCallRequest,
		observer: IRpcProtocolStreamObserver,
	): IRpcProtocolIncomingStream | undefined;
	/** Owns preflight through terminal cleanup; facade converts synchronous preflight errors to rejections. */
	invoke(
		service: string,
		method: string,
		cancelable: boolean,
		actualArguments: readonly unknown[],
	): Promise<unknown>;
	/** Retains capacity and lends exactly one synchronous commit scope before handler dispatch. */
	reserveIncomingCall(
		request: IRpcProtocolCallRequest,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): boolean;
}

/** Bound once for one stable Peer; lifecycle phases and cleanup never cross this creation seam. */
export type RpcPeerCallLifecycleFactory = (
	options: Readonly<{
		readonly peer: IRpcPeer;
		readonly getSession: () => IRpcProtocolSession | undefined;
		readonly findExposure: (wireName: string) => RpcExposure | undefined;
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
) => IRpcPeerCallLifecycle;
