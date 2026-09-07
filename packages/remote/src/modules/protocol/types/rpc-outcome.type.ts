/**
 * @overview RPC Protocol call failure and Session close reason contracts.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export type RpcCallFailure = Exclude<
	RpcExceptionCodeEnum,
	RpcExceptionCodeEnum.protocol
>;

export type RpcProtocolFaultReason = Extract<
	RpcCloseReasonEnum,
	RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault
>;

export type RpcSessionCloseReason = Exclude<
	RpcCloseReasonEnum,
	RpcCloseReasonEnum.cleanupFailed
>;
