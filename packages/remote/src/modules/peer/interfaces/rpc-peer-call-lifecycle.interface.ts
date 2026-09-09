/**
 * @overview Private Framework call lifecycle and its dependency-neutral creation contract.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { IRpcHandlerScheduler } from "@/modules/peer/interfaces/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type { RpcExposure } from "@/modules/peer/types/rpc-exposure.type";
import type { RpcCallEventSink } from "@/modules/peer/types/rpc-peer-call-event.type";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcProtocolIncomingCallReservation,
} from "@/modules/protocol";

export interface IRpcPeerCallLifecycle {
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
		readonly onProtocolFault: (error: Error) => void;
		readonly handlerScheduler: IRpcHandlerScheduler;
		readonly maximumIncomingBytes: number;
		readonly reserveRetainedBytes: (
			bytes: number,
		) => IRpcRetainedBytesReservation | undefined;
	}>,
) => IRpcPeerCallLifecycle;
