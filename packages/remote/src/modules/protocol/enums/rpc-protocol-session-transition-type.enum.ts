/**
 * @overview Semantic Protocol Session transition type enum.
 * @author AEPKILL
 * @created 2026-09-08 22:40:33
 */

export enum RpcProtocolSessionTransitionTypeEnum {
	draining = "draining",
	recovering = "recovering",
	recovered = "recovered",
	closed = "closed",
}
