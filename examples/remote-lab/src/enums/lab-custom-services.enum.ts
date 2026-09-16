/**
 * @overview Named scopes, behaviors and commands for form-defined Lab services.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

export enum LabCustomScopeEnum {
	nodeGlobal = "node-global",
	nodePeer = "node-peer",
	browserPeer = "browser-peer",
}

export enum LabCustomBehaviorEnum {
	fixed = "fixed",
	echo = "echo",
	throw = "throw",
}

export enum LabCustomActionEnum {
	save = "save",
	expose = "expose",
	revoke = "revoke",
	remove = "delete",
	reset = "reset",
	resolve = "resolve",
	call = "call",
	cancel = "cancel",
	advertise = "advertise",
}

export enum LabCustomFailureEnum {
	validation = "validation",
	staleRevision = "stale-revision",
	staleInstance = "stale-instance",
	targetUnavailable = "target-unavailable",
	exposed = "revoke-before-edit",
	missing = "not-found",
	conflict = "exposure-conflict",
}
