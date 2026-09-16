/**
 * @overview Reconnection module boundary.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

/** biome-ignore-all assist/source/organizeImports: Type exports precede runtime exports at the module boundary. */
export type {
	CreateRpcReconnectionConnectorOptions,
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionPolicyOptions,
	RpcConnectorReconnectionState,
} from "./types/rpc-connector-reconnection.type";
export type { IRpcConnectorReconnection } from "./interfaces/rpc-connector-reconnection.interface";
export { createRpcReconnectionConnector } from "./factories/rpc-reconnection-connector.factory";
export { RpcConnectorReconnectionAttemptFailureStageEnum } from "./enums/rpc-connector-reconnection-attempt-failure-stage.enum";
export { RpcConnectorReconnectionEventTypeEnum } from "./enums/rpc-connector-reconnection-event-type.enum";
export { RpcConnectorReconnectionStopReasonEnum } from "./enums/rpc-connector-reconnection-stop-reason.enum";
