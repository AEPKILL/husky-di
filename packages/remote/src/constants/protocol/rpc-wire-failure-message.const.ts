/**
 * @overview Fixed safe failure text for husky-di-rpc/1 unary and stream terminals.
 * @author AEPKILL
 * @created 2026-08-25 01:38:00
 */

import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	RpcStreamWireErrorCode,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";

export const RPC_WIRE_FAILURE_MESSAGES: Readonly<
	Record<RpcWireErrorCode | RpcStreamWireErrorCode, string>
> = Object.freeze({
	[RpcExceptionCodeEnum.canceled]: "Remote operation was canceled.",
	[RpcExceptionCodeEnum.unavailable]: "Remote operation is unavailable.",
	[RpcExceptionCodeEnum.handlerFailed]: "Remote operation failed.",
	[RpcExceptionCodeEnum.unknownService]: "Remote service is unknown.",
	[RpcExceptionCodeEnum.unknownMember]: "Remote member is unknown.",
	[RpcExceptionCodeEnum.overflow]: "Remote stream overflowed.",
});
