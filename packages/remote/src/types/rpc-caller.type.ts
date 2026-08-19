/**
 * @overview Caller-facing RPC state and option types.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcError } from "@/exceptions/rpc-error.exception";
import type {
	IRpcProtocol,
	IRpcProtocolRuntimePolicy,
	RpcProtocolFaultReason,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";

type RpcNormalSessionCloseReason = Extract<
	RpcSessionCloseReason,
	| "graceful-shutdown"
	| "forced-close"
	| "shutdown-deadline"
	| "remote-terminated"
>;

type RpcUnavailableSessionFailureReason = Extract<
	RpcSessionCloseReason,
	"recovery-expired" | "counter-exhaustion"
>;

type RpcProtocolSessionFailureReason = Extract<
	RpcSessionCloseReason,
	"continuity-failure" | RpcProtocolFaultReason
>;

export type RpcPeerState =
	| { readonly status: "unbound" }
	| { readonly status: "connecting" }
	| { readonly status: "connected" }
	| {
			readonly status: "draining";
			readonly reason: "graceful-shutdown" | "counter-exhaustion";
	  }
	| { readonly status: "recovering" }
	| {
			readonly status: "closed";
			readonly outcome: "normal";
			readonly reason: RpcNormalSessionCloseReason;
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: RpcUnavailableSessionFailureReason;
			readonly error: RpcError & { readonly code: "unavailable" };
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: RpcProtocolSessionFailureReason;
			readonly error: RpcError & { readonly code: "protocol" };
	  };

export type RpcTopologyCloseReason = RpcSessionCloseReason | "cleanup-failed";

type RpcConnectorClosedState =
	| {
			readonly status: "closed";
			readonly outcome: "normal";
			readonly reason: RpcNormalSessionCloseReason;
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: RpcUnavailableSessionFailureReason;
			readonly error: RpcError & { readonly code: "unavailable" };
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: RpcProtocolSessionFailureReason;
			readonly error: RpcError & { readonly code: "protocol" };
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: "cleanup-failed";
			readonly error: Error;
	  };

export type RpcConnectorState =
	| { readonly status: "active" }
	| { readonly status: "draining" }
	| { readonly status: "closing" }
	| RpcConnectorClosedState;

export type RpcAcceptorListenerState =
	| { readonly status: "idle" }
	| { readonly status: "starting" }
	| { readonly status: "listening" }
	| {
			readonly status: "stopped";
			readonly outcome: "normal";
			readonly reason: "completed" | "resource-pressure";
	  }
	| {
			readonly status: "stopped";
			readonly outcome: "failed";
			readonly error: Error;
	  };

type RpcAcceptorClosedState =
	| {
			readonly status: "closed";
			readonly outcome: "normal";
			readonly reason:
				| "graceful-shutdown"
				| "forced-close"
				| "shutdown-deadline";
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: RpcProtocolFaultReason;
			readonly error: RpcError & { readonly code: "protocol" };
	  }
	| {
			readonly status: "closed";
			readonly outcome: "failed";
			readonly reason: "cleanup-failed";
			readonly error: Error;
	  };

export type RpcAcceptorState =
	| {
			readonly status: "active";
			readonly listener: RpcAcceptorListenerState;
	  }
	| { readonly status: "draining" }
	| { readonly status: "closing" }
	| RpcAcceptorClosedState;

export type RpcAcceptorRuntimePolicyOptions = {
	readonly [K in keyof IRpcProtocolRuntimePolicy]?: IRpcProtocolRuntimePolicy[K];
};

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

export type RpcAcceptorOptions = {
	readonly protocol?: IRpcProtocol;
	readonly runtimePolicy?: RpcAcceptorRuntimePolicyOptions;
};
