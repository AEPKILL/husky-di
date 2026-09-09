/**
 * @overview Carries one already-attributed Protocol case failure through work and disposal.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { Operation } from "@/conformance/types/rpc-protocol-case-lifetime.type";

export class RpcCaseOperationException extends Error {
	constructor(readonly operation: Operation) {
		super("Protocol case operation failed.");
	}
}
