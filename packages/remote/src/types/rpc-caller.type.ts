/**
 * @overview Caller-facing RPC state and option types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcAcceptorListenerStopReasonEnum } from "@/enums/rpc-acceptor-listener-stop-reason.enum";
import type { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import type { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { RpcException } from "@/exceptions/rpc.exception";
import type {
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/transport/rpc-adapter.interface";

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

type RpcConnectorClosedState =
	| RpcSessionClosedState
	| {
			readonly status: RpcStateStatusEnum.closed;
			readonly outcome: RpcCloseOutcomeEnum.failed;
			readonly reason: RpcCloseReasonEnum.cleanupFailed;
			readonly error: Error;
	  };

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

export type RpcAcceptorState =
	| {
			readonly status: RpcStateStatusEnum.active;
			readonly listener: RpcAcceptorListenerState;
	  }
	| { readonly status: RpcStateStatusEnum.draining }
	| { readonly status: RpcStateStatusEnum.closing }
	| RpcAcceptorClosedState;

export type RpcAcceptorRuntimePolicyOptions =
	Partial<IRpcProtocolRuntimePolicy>;

export type RpcConnectorRuntimePolicyOptions = Pick<
	RpcAcceptorRuntimePolicyOptions,
	| "maxPendingInvocationsPerSession"
	| "maxRetainedBytesPerSession"
	| "maxHandlersPerSession"
	| "ackDelayMs"
	| "activityProbeIntervalMs"
	| "silenceTimeoutMs"
	| "sendProgressTimeoutMs"
	| "bindingAttemptTimeoutMs"
	| "recoveryGraceMs"
	| "shutdownDeadlineMs"
>;

export type RpcConnectorOptions = {
	readonly protocol?: IRpcProtocol;
	readonly runtimePolicy?: RpcConnectorRuntimePolicyOptions;
};

export type RpcConnectorConnectOptions = {
	readonly adapter: IRpcConnectorAdapter;
	readonly signal?: AbortSignal;
};

export type RpcAcceptorOptions = {
	readonly protocol?: IRpcProtocol;
	readonly runtimePolicy?: RpcAcceptorRuntimePolicyOptions;
};
