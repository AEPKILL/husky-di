/**
 * @overview Public RPC Topology Owner event types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcEventTypeEnum } from "@/modules/owner/enums/rpc-event-type.enum";
import type { IRpcPeer, RpcPeerCallEvent } from "@/modules/peer";
import type { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type RpcEvent =
	| RpcTopologyLifecycleEvent
	| RpcPeerLifecycleEvent
	| RpcPeerCallEvent;

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
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated;
	  }
	| {
			readonly type: RpcEventTypeEnum.peerClosed;
			readonly peer: IRpcPeer;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason:
				| RpcCloseReasonEnum.recoveryExpired
				| RpcCloseReasonEnum.counterExhaustion
				| RpcCloseReasonEnum.continuityFailure
				| RpcCloseReasonEnum.protocolFault
				| RpcCloseReasonEnum.resourceFault;
	  };

type RpcTopologyLifecycleEvent =
	| { readonly type: RpcEventTypeEnum.ownerDraining }
	| { readonly type: RpcEventTypeEnum.ownerClosing }
	| {
			readonly type: RpcEventTypeEnum.topologyClosed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline
				| RpcCloseReasonEnum.remoteTerminated;
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
