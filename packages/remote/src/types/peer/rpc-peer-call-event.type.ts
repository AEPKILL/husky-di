/**
 * @overview Private RPC Peer call event types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCallDirectionEnum } from "@/enums/rpc-call-direction.enum";
import type { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { RpcCallFailure } from "@/interfaces/protocol/rpc-protocol.interface";

export type RpcPeerCallEvent = RpcCallStartedEvent | RpcCallFinishedEvent;

type RpcCallObservationBase = {
	readonly observationId: string;
	readonly peer: IRpcPeer;
};

type RpcOutgoingCallContext = {
	readonly direction: RpcCallDirectionEnum.outgoing;
	readonly service: string;
	readonly method: string;
};

type RpcKnownIncomingCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service: string;
	readonly method: string;
};

type RpcUnknownServiceCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service?: never;
	readonly method?: never;
};

type RpcUnknownMethodCallContext = {
	readonly direction: RpcCallDirectionEnum.incoming;
	readonly service: string;
	readonly method?: never;
};

type RpcCallStartedEvent = RpcCallObservationBase &
	(
		| RpcOutgoingCallContext
		| RpcKnownIncomingCallContext
		| RpcUnknownServiceCallContext
		| RpcUnknownMethodCallContext
	) & { readonly type: RpcEventTypeEnum.callStarted };

type RpcCallFinishedBase = RpcCallObservationBase & {
	readonly type: RpcEventTypeEnum.callFinished;
	readonly durationMs: number;
};

type RpcCallFinishedEvent = RpcCallFinishedBase &
	(
		| (RpcOutgoingCallContext & {
				readonly outcome: RpcCallStatusEnum.fulfilled;
		  })
		| (RpcOutgoingCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcCallFailure;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.fulfilled;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code:
					| RpcExceptionCodeEnum.canceled
					| RpcExceptionCodeEnum.handlerFailed;
		  })
		| (RpcKnownIncomingCallContext & {
				readonly outcome: RpcCallStatusEnum.terminated;
		  })
		| (RpcUnknownServiceCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcExceptionCodeEnum.unknownService;
		  })
		| (RpcUnknownMethodCallContext & {
				readonly outcome: RpcCallStatusEnum.rejected;
				readonly code: RpcExceptionCodeEnum.unknownMethod;
		  })
	);
