/**
 * @overview Framework-created safe RPC Exception.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { CodedException } from "@husky-di/core";

import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";

/** Safe public RPC failure with a closed branch code. */
export class RpcException extends CodedException<RpcExceptionCodeEnum> {
	readonly cause?: unknown;

	public constructor(code: RpcExceptionCodeEnum, cause?: unknown) {
		super(code, "RPC failed.");
		this.name = "RpcException";
		this.cause = cause;
	}
}
