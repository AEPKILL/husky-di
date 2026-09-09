/**
 * @overview Built-in RPC Codec decode phase enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcDecodePhaseEnum {
	json = "json",
	bootstrapRequest = "bootstrap-request",
	freshAccept = "fresh-accept",
	resumeOutcome = "resume-outcome",
	active = "active",
}
