/**
 * @overview Assemble one private Protocol case lifetime.
 * @author AEPKILL
 * @created 2026-09-06 00:19:06
 */

import { RpcProtocolCaseLifetimeImpl } from "@/conformance/impls/rpc-protocol-case-lifetime.impl";
import type { RpcProtocolCaseLifetimeFactory } from "@/conformance/interfaces/rpc-protocol-case-lifetime.interface";

export const createRpcProtocolCaseLifetime: RpcProtocolCaseLifetimeFactory =
	() => new RpcProtocolCaseLifetimeImpl();
