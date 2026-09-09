/**
 * @overview Semantic Protocol call terminal type enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcCallTerminalTypeEnum {
	notStarted = "not-started",
	returnedVoid = "returned-void",
	returned = "returned",
	failed = "failed",
	sessionTerminated = "session-terminated",
}
