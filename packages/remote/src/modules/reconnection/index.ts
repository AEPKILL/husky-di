/**
 * @overview Reconnection module boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type {
	CreateRpcConnectorReconnectionOptions,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
} from "./types/rpc-connector-reconnection.type";
export type { IRpcConnectorReconnection } from "./interfaces/rpc-connector-reconnection.interface";
export { createRpcConnectorReconnection } from "./factories/rpc-connector-reconnection.factory";
export { RpcConnectorReconnectionAttemptFailureStageEnum } from "./enums/rpc-connector-reconnection-attempt-failure-stage.enum";
export { RpcConnectorReconnectionEventTypeEnum } from "./enums/rpc-connector-reconnection-event-type.enum";
export { RpcConnectorReconnectionStopReasonEnum } from "./enums/rpc-connector-reconnection-stop-reason.enum";
