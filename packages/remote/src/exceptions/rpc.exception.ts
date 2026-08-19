/**
 * @overview Framework-created safe RPC Exception.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { CodedException } from "@husky-di/core";

import type { RpcExceptionCode } from "@/types/rpc-exception.type";

/** Safe public RPC failure with a closed branch code. */
export class RpcException extends CodedException<RpcExceptionCode> {
	readonly cause?: unknown;

	public constructor(code: RpcExceptionCode, cause?: unknown) {
		super(code, "RPC failed.");
		this.name = "RpcException";
		this.cause = cause;
	}
}
