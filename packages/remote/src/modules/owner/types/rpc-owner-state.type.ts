/**
 * @overview Caller-facing RPC Topology Owner and Acceptor listener states.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcAcceptorListenerStopReasonEnum } from "@/modules/owner/enums/rpc-acceptor-listener-stop-reason.enum";
import type { RpcSessionClosedState } from "@/modules/peer";
import type { RpcProtocolFaultReason } from "@/modules/protocol";
import type { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import type { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import type { RpcException } from "@/shared/exceptions/rpc.exception";

export type RpcConnectorState =
	| { readonly status: RpcStateStatusEnum.active }
	| { readonly status: RpcStateStatusEnum.draining }
	| { readonly status: RpcStateStatusEnum.closing }
	| RpcConnectorClosedState;

export type RpcAcceptorListenerState =
	| { readonly status: RpcStateStatusEnum.idle }
	| { readonly status: RpcStateStatusEnum.starting }
	| { readonly status: RpcStateStatusEnum.listening }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason: RpcAcceptorListenerStopReasonEnum;
	  }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly error: Error;
	  };

export type RpcAcceptorState =
	| {
			readonly status: RpcStateStatusEnum.active;
			readonly listener: RpcAcceptorListenerState;
	  }
	| { readonly status: RpcStateStatusEnum.draining }
	| { readonly status: RpcStateStatusEnum.closing }
	| RpcAcceptorClosedState;

type RpcConnectorClosedState =
	| RpcSessionClosedState
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcCloseReasonEnum.cleanupFailed;
			readonly error: Error;
	  };

type RpcAcceptorClosedState =
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.normal;
			readonly reason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| RpcCloseReasonEnum.shutdownDeadline;
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcProtocolFaultReason;
			readonly error: RpcException & {
				readonly code: RpcExceptionCodeEnum.protocol;
			};
	  }
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcCloseReasonEnum.cleanupFailed;
			readonly error: Error;
	  };
