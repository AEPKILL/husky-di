/**
 * @overview Semantic Protocol Session transition type enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcProtocolSessionTransitionTypeEnum {
	draining = "draining",
	recovering = "recovering",
	recovered = "recovered",
	closed = "closed",
}
