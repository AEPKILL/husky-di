/**
 * @overview Protocol-originated Session transitions and their permitted close reasons.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol/enums/rpc-protocol-session-transition-type.enum";
import type {
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/modules/protocol/types/rpc-outcome.type";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type RpcProtocolSessionTransition =
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.draining;
			readonly reason: RpcCloseReasonEnum.counterExhaustion;
	  }
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.recovering;
			readonly cause?: Error;
	  }
	| { readonly type: RpcProtocolSessionTransitionTypeEnum.recovered }
	| {
			readonly type: RpcProtocolSessionTransitionTypeEnum.closed;
			readonly reason: RpcProtocolSessionTransitionCloseReason;
			readonly cause?: Error;
	  };

type RpcProtocolSessionTransitionCloseReason = Exclude<
	RpcSessionCloseReason,
	RpcProtocolFaultReason | RpcCloseReasonEnum.shutdownDeadline
>;
