/**
 * @overview Connector Reconnection terminal reasons.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27 02:16:00
 */

export enum RpcConnectorReconnectionStopReasonEnum {
	requested = "requested",
	initialConnectionFailed = "initial-connection-failed",
	retriesExhausted = "retries-exhausted",
	connectorTerminated = "connector-terminated",
}
