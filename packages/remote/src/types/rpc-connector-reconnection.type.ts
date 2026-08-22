/**
 * @overview Connector Reconnection construction and state types.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import type { RpcConnectorReconnectionAttemptFailureStageEnum } from "@/enums/rpc-connector-reconnection-attempt-failure-stage.enum";
import type { RpcConnectorReconnectionEventTypeEnum } from "@/enums/rpc-connector-reconnection-event-type.enum";
import type { RpcConnectorReconnectionStopReasonEnum } from "@/enums/rpc-connector-reconnection-stop-reason.enum";
import type { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { IRpcConnectorAdapter } from "@/interfaces/rpc-adapter.interface";
import type { IRpcConnector } from "@/interfaces/rpc-caller.interface";

export type RpcConnectorAdapterFactory = () => IRpcConnectorAdapter;

export type RpcConnectorReconnectionPolicyOptions = {
	readonly retryDelaysMs?: readonly number[];
	readonly attemptTimeoutMs?: number;
};

export type RpcConnectorReconnectionPolicy =
	Required<RpcConnectorReconnectionPolicyOptions>;

export type CreateRpcConnectorReconnectionOptions = {
	readonly connector: IRpcConnector;
	readonly adapterFactory: RpcConnectorAdapterFactory;
	readonly policy?: RpcConnectorReconnectionPolicyOptions;
};

export type RpcConnectorReconnectionState =
	| { readonly status: RpcStateStatusEnum.idle }
	| { readonly status: RpcStateStatusEnum.connecting }
	| { readonly status: RpcStateStatusEnum.monitoring }
	| {
			readonly status: RpcStateStatusEnum.reconnecting;
			readonly attempt: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.waiting;
			readonly nextAttempt: number;
			readonly delayMs: number;
	  }
	| {
			readonly status: RpcStateStatusEnum.stopped;
			readonly reason: RpcConnectorReconnectionStopReasonEnum;
	  };

export type RpcConnectorReconnectionEvent = {
	readonly type: RpcConnectorReconnectionEventTypeEnum.attemptFailed;
	readonly attempt: number;
	readonly stage: RpcConnectorReconnectionAttemptFailureStageEnum;
	readonly nextDelayMs?: number;
};
