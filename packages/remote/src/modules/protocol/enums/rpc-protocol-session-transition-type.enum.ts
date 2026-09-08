/**
 * @overview Session lifecycle transitions reported by an RPC Protocol.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

export enum RpcProtocolSessionTransitionTypeEnum {
	draining = "draining",
	recovering = "recovering",
	recovered = "recovered",
	closed = "closed",
}
