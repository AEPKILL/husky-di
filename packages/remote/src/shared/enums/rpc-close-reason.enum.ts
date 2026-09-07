/**
 * @overview RPC Session and Topology close reason enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcCloseReasonEnum {
	gracefulShutdown = "graceful-shutdown",
	forcedClose = "forced-close",
	shutdownDeadline = "shutdown-deadline",
	remoteTerminated = "remote-terminated",
	recoveryExpired = "recovery-expired",
	continuityFailure = "continuity-failure",
	counterExhaustion = "counter-exhaustion",
	protocolFault = "protocol-fault",
	resourceFault = "resource-fault",
	cleanupFailed = "cleanup-failed",
}
