/**
 * @overview Public RPC Topology Owner event types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { RpcPeerCallEvent } from "@/types/peer/rpc-peer-call-event.type";

type RpcPeerLifecycleEvent =
	| {
			readonly type:
				| RpcEventTypeEnum.peerOpened
				| RpcEventTypeEnum.peerRecovering
				| RpcEventTypeEnum.peerRecovered;
			readonly peer: IRpcPeer;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerDraining;
			readonly peer: IRpcPeer;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.counterExhaustion;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.recoveryExpired
				| RpcCloseReasonEnum.counterExhaustion
				| RpcCloseReasonEnum.continuityFailure
				| RpcCloseReasonEnum.protocolFault
				| RpcCloseReasonEnum.resourceFault
			>;
	  };

type RpcTopologyLifecycleEvent =
	| { readonly type: RpcEventTypeEnum.ownerDraining }
	| { readonly type: RpcEventTypeEnum.ownerClosing }
	| {
			readonly type: RpcEventTypeEnum.topologyClosed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: Extract<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  }
	| {
			readonly type: RpcEventTypeEnum.topologyClosed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: Exclude<
				RpcCloseReasonEnum,
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated
			>;
	  };

export type RpcEvent =
	| RpcTopologyLifecycleEvent
	| RpcPeerLifecycleEvent
	| RpcPeerCallEvent;
