/**
 * @overview RPC Session and Topology close reason enum.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
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
