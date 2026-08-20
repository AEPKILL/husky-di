/**
 * @overview Caller-visible RPC exception code enum.
 * @author AEPKILL
 * @created 2026-08-20 00:00:00
 */

export enum RpcExceptionCodeEnum {
	canceled = "canceled",
	unavailable = "unavailable",
	outcomeUnknown = "outcome-unknown",
	handlerFailed = "handler-failed",
	unknownService = "unknown-service",
	unknownMethod = "unknown-method",
	protocol = "protocol",
}
