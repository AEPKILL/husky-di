/**
 * @overview RPC Peer lifecycle states and correlated terminal outcomes.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/modules/protocol";
import type { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import type { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import type { RpcException } from "@/shared/exceptions/rpc.exception";

export type RpcPeerState =
	| { readonly status: RpcStateStatusEnum.unbound }
	| { readonly status: RpcStateStatusEnum.connecting }
	| { readonly status: RpcStateStatusEnum.connected }
	| {
			readonly status: RpcStateStatusEnum.draining;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.counterExhaustion;
	  }
	| { readonly status: RpcStateStatusEnum.recovering }
	| RpcSessionClosedState;

type RpcNormalSessionCloseReason = Extract<
	RpcSessionCloseReason,
	| RpcCloseReasonEnum.gracefulShutdown
	| RpcCloseReasonEnum.forcedClose
	| RpcCloseReasonEnum.shutdownDeadline
	| RpcCloseReasonEnum.remoteTerminated
>;

type RpcUnavailableSessionFailureReason = Extract<
	RpcSessionCloseReason,
	RpcCloseReasonEnum.recoveryExpired | RpcCloseReasonEnum.counterExhaustion
>;

type RpcProtocolSessionFailureReason = Extract<
	RpcSessionCloseReason,
	RpcCloseReasonEnum.continuityFailure | RpcProtocolFaultReason
>;

type RpcSessionClosedState =
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: RpcNormalSessionCloseReason;
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcUnavailableSessionFailureReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.unavailable;
			};
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcProtocolSessionFailureReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.protocol;
			};
	  };
