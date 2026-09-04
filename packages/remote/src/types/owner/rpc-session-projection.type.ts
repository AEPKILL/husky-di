/**
 * @overview Pure Logical Session transition decisions and lifecycle facts.
 * @author AEPKILL
 * @created 2026-08-31 01:46:19
 */

import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";

export type RpcSessionOwnerStatus = Extract<
	RpcStateStatusEnum,
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining
	| RpcStateStatusEnum.closing
	| RpcStateStatusEnum.closed
>;

export type RpcPeerLifecycleFact = WithoutPeer<RpcPeerLifecycleEvent>;

export type RpcSessionFault = Readonly<{
	readonly kind: "fault";
	readonly reason: RpcCloseReasonEnum.protocolFault;
	readonly error: Error;
}>;

export type RpcSessionTerminalChange = Readonly<{
	readonly kind: "change";
	readonly state: Extract<
		RpcPeerState,
		{ readonly status: RpcStateStatusEnum.closed }
	>;
	readonly lifecycle: Extract<
		RpcPeerLifecycleFact,
		{ readonly type: RpcEventTypeEnum.peerClosed }
	>;
	readonly terminal: true;
}>;

export type RpcSessionChange =
	| RpcSessionContinuingChange
	| RpcSessionTerminalChange;

export type RpcSessionTransitionDecision = RpcSessionFault | RpcSessionChange;

type RpcPeerLifecycleEvent = Extract<
	DistributeEventTypes<RpcEvent>,
	{
		readonly type:
			| RpcEventTypeEnum.peerRecovering
			| RpcEventTypeEnum.peerRecovered
			| RpcEventTypeEnum.peerDraining
			| RpcEventTypeEnum.peerClosed;
	}
>;

type DistributeEventTypes<TEvent> = TEvent extends {
	readonly type: infer TType;
}
	? TType extends RpcEventTypeEnum
		? Omit<TEvent, "type"> & Readonly<{ readonly type: TType }>
		: never
	: never;

type WithoutPeer<TEvent> = TEvent extends RpcPeerLifecycleEvent
	? Omit<TEvent, "peer">
	: never;

type RpcSessionContinuingChange =
	| RpcSessionContinuingChangeOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.recovering }>,
			Extract<
				RpcPeerLifecycleFact,
				{ readonly type: RpcEventTypeEnum.peerRecovering }
			>
	  >
	| RpcSessionContinuingChangeOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.connected }>,
			Extract<
				RpcPeerLifecycleFact,
				{ readonly type: RpcEventTypeEnum.peerRecovered }
			>
	  >
	| RpcSessionContinuingChangeOf<
			Extract<RpcPeerState, { readonly status: RpcStateStatusEnum.draining }>,
			Extract<
				RpcPeerLifecycleFact,
				{ readonly type: RpcEventTypeEnum.peerDraining }
			>
	  >;

type RpcSessionContinuingChangeOf<
	TState extends RpcPeerState,
	TLifecycle extends RpcPeerLifecycleFact,
> = Readonly<{
	readonly kind: "change";
	readonly state: TState;
	readonly lifecycle: TLifecycle;
	readonly terminal: false;
}>;
