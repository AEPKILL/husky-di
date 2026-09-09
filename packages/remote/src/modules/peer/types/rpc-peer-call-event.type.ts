/**
 * @overview Private RPC Peer call event types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import type { RpcCallStatusEnum } from "@/modules/peer/enums/rpc-call-status.enum";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type { RpcCallFailure } from "@/modules/protocol";
import type { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import type { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export type RpcPeerCallEvent = RpcCallStartedEvent | RpcCallFinishedEvent;

export type RpcCallEventSink = (event: RpcPeerCallEvent) => void;

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
