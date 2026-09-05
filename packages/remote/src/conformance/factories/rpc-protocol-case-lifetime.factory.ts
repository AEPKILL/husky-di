/**
 * @overview Assemble one private Protocol case lifetime.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcProtocolCaseLifetimeImpl } from "@/conformance/impls/rpc-protocol-case-lifetime.impl";
import type { RpcProtocolCaseLifetimeFactory } from "@/conformance/interfaces/rpc-protocol-case-lifetime.interface";

export const createRpcProtocolCaseLifetime: RpcProtocolCaseLifetimeFactory =
	() => new RpcProtocolCaseLifetimeImpl();
