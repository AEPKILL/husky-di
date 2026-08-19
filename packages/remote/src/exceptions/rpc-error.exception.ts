/**
 * @overview Framework-created safe RPC Error.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCallFailure } from "@/interfaces/rpc-protocol.interface";

export type RpcErrorCode = RpcCallFailure | "protocol";

const CREATE_RPC_ERROR = Symbol("createRpcError");

/** Safe public RPC failure with a closed branch code. */
export class RpcError extends Error {
	readonly code: RpcErrorCode;
	readonly cause?: unknown;

	private constructor(
		token: typeof CREATE_RPC_ERROR,
		code: RpcErrorCode,
		cause?: unknown,
	) {
		if (token !== CREATE_RPC_ERROR) {
			throw new TypeError("RpcError cannot be constructed by callers.");
		}
		super(`RPC failed with code ${code}.`);
		this.name = "RpcError";
		this.code = code;
		this.cause = cause;
	}
}

/** Internal constructor; it is intentionally not re-exported from a package entry. */
export function createRpcError<const Code extends RpcErrorCode>(
	code: Code,
	cause?: unknown,
): RpcError & { readonly code: Code } {
	return Reflect.construct(RpcError, [
		CREATE_RPC_ERROR,
		code,
		cause,
	]) as RpcError & {
		readonly code: Code;
	};
}
