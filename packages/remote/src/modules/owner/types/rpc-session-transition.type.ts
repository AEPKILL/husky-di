/**
 * @overview Correlated Session transition decisions and payload-free Peer lifecycle facts.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcPeerState } from "@/modules/peer";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import type { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

export type RpcSessionOwnerStatus = Extract<
	RpcStateStatusEnum,
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining
	| RpcStateStatusEnum.closing
	| RpcStateStatusEnum.closed
>;

export type RpcPeerLifecycleFact = WithoutPeer<RpcPeerLifecycleEvent>;

export type RpcSessionTerminalChange = Readonly<{
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

export type RpcSessionTransitionDecision = RpcSessionFault | RpcSessionChange;

export type RpcSessionChange =
	| RpcSessionContinuingChange
	| RpcSessionTerminalChange;

type RpcSessionFault = Readonly<{
	readonly reason: RpcCloseReasonEnum.protocolFault;
	readonly error: Error;
}>;

type RpcSessionContinuingChange = Readonly<{
	readonly state: Extract<
		RpcPeerState,
		{
			readonly status:
				| RpcStateStatusEnum.recovering
				| RpcStateStatusEnum.connected
				| RpcStateStatusEnum.draining;
		}
	>;
	readonly lifecycle: Exclude<
		RpcPeerLifecycleFact,
		{ readonly type: RpcEventTypeEnum.peerClosed }
	>;
	readonly terminal: false;
}>;

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
