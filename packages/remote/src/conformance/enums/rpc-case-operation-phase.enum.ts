/**
 * @overview Stable ordering of Protocol case capability, work, close and cleanup failures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export enum RpcCaseOperationPhaseEnum {
	capabilityRead = 0,
	work = 1,
	close = 2,
	cleanup = 3,
}
