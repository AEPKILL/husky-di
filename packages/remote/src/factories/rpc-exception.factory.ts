/**
 * @overview Package-private RpcException construction.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcException } from "@/exceptions/rpc.exception";

/** Internal factory; it is intentionally not re-exported from a package entry. */
export function createRpcException<const Code extends RpcExceptionCodeEnum>(
	code: Code,
	cause?: unknown,
): RpcException & { readonly code: Code } {
	return new RpcException(code, cause) as RpcException & {
		readonly code: Code;
	};
}
