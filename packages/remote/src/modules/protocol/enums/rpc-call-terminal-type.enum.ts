/**
 * @overview Semantic Protocol call terminal type enum.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

export enum RpcCallTerminalTypeEnum {
	notStarted = "not-started",
	returnedVoid = "returned-void",
	returned = "returned",
	failed = "failed",
	sessionTerminated = "session-terminated",
}
