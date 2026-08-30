/**
 * @overview Private Logical Session projection intents and results.
 * @author AEPKILL
 * @created 2026-08-31 01:46:19
 */

import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type {
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";

export type RpcSessionOwnerStatus = Extract<
	RpcStateStatusEnum,
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining
	| RpcStateStatusEnum.closing
	| RpcStateStatusEnum.closed
>;

export type RpcSessionTransitionProjectionIntent = Readonly<{
	readonly kind: "transition";
	readonly ownerStatus: RpcSessionOwnerStatus;
	readonly transition: RpcProtocolSessionTransition;
}>;

export type RpcSessionClosureProjectionIntent = Readonly<{
	readonly kind: "closure";
	readonly reason: RpcSessionCloseReason;
	readonly cause?: Error;
}>;

export type RpcSessionProjectionIntent =
	| RpcSessionTransitionProjectionIntent
	| RpcSessionClosureProjectionIntent;

export type RpcSessionTerminalProjection = Readonly<{
	readonly kind: "commit";
	readonly peerMutation: Readonly<{
		readonly peer: IRpcPeerRuntime;
		readonly state: Extract<
			RpcPeerState,
			{ readonly status: RpcStateStatusEnum.closed }
		>;
		readonly terminal: true;
	}>;
	readonly event: RpcSessionProjectionEvent<RpcEventTypeEnum.peerClosed>;
}>;

export type RpcSessionProjection =
	| Readonly<{
			readonly kind: "invalid";
			readonly fault: Readonly<{
				readonly reason: RpcCloseReasonEnum.protocolFault;
				readonly error: Error;
			}>;
	  }>
	| RpcSessionContinuingProjection
	| RpcSessionTerminalProjection;

type RpcSessionProjectionEvent<TType extends RpcEventTypeEnum> = RpcEvent &
	Readonly<{ readonly type: TType }>;

type RpcSessionContinuingProjection =
	| RpcSessionContinuingProjectionOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.recovering }>,
			RpcSessionProjectionEvent<RpcEventTypeEnum.peerRecovering>
	  >
	| RpcSessionContinuingProjectionOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.connected }>,
			RpcSessionProjectionEvent<RpcEventTypeEnum.peerRecovered>
	  >
	| RpcSessionContinuingProjectionOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.draining }>,
			RpcSessionProjectionEvent<RpcEventTypeEnum.peerDraining>
	  >;

type RpcSessionContinuingProjectionOf<
	TState extends RpcPeerState,
	TEvent extends RpcEvent,
> = Readonly<{
	readonly kind: "commit";
	readonly peerMutation: Readonly<{
		readonly peer: IRpcPeerRuntime;
		readonly state: TState;
		readonly terminal?: never;
	}>;
	readonly event: TEvent;
}>;
