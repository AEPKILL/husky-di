/**
 * @overview Closed sets used by the local Observable stream experiment.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

export enum LabStreamKindEnum {
	method = "method",
	static = "static",
}

export enum LabStreamStatusEnum {
	open = "open",
	complete = "complete",
	error = "error",
	canceled = "canceled",
}

export enum LabStreamSourceStatusEnum {
	idle = "idle",
	connected = "connected",
}

export enum LabStreamNetworkKindEnum {
	disconnect = "stream-disconnect",
	recover = "stream-recover",
	overflow = "stream-overflow",
	sourceConnect = "stream-source-connect",
	sourceShare = "stream-source-share",
	sourceTeardown = "stream-source-teardown",
}
