/**
 * @overview Connector Reconnection attempt failure stages.
 * @author AEPKILL
 * @created 2026-08-21 02:24:00
 */

export enum RpcConnectorReconnectionAttemptFailureStageEnum {
	adapterFactory = "adapter-factory",
	connectorAttempt = "connector-attempt",
	attemptTimeout = "attempt-timeout",
}
