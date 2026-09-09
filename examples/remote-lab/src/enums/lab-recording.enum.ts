/**
 * @overview Labels for example-owned recording sources and endpoints.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export enum LabSideEnum {
	browser = "Browser",
	node = "Node",
}

export enum LabSourceEnum {
	application = "APP",
	rpc = "RPC",
	transport = "TRANSPORT",
}

export enum LabCallOutcomeEnum {
	pending = "pending",
	fulfilled = "fulfilled",
	typeError = "TypeError",
	handlerFailed = "handler-failed",
}
