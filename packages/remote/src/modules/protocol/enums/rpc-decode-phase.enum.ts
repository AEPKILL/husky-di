/**
 * @overview Built-in RPC Codec decode phase enum.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

export enum RpcDecodePhaseEnum {
	json = "json",
	bootstrapRequest = "bootstrap-request",
	freshAccept = "fresh-accept",
	resumeOutcome = "resume-outcome",
	active = "active",
}
