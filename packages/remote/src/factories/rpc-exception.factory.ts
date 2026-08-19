/**
 * @overview Package-private RpcException construction.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcException } from "@/exceptions/rpc.exception";
import type { RpcExceptionCode } from "@/types/rpc-exception.type";

/** Internal factory; it is intentionally not re-exported from a package entry. */
export function createRpcException<const Code extends RpcExceptionCode>(
	code: Code,
	cause?: unknown,
): RpcException & { readonly code: Code } {
	return new RpcException(code, cause) as RpcException & {
		readonly code: Code;
	};
}
