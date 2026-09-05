/**
 * @overview Assembles private outgoing invocation ownership for one Logical Session.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcSessionInvocationsImpl } from "@/impls/session/rpc-session-invocations.impl";
import type { RpcSessionInvocationsFactory } from "@/interfaces/session/rpc-session-invocations.interface";

/** Creates the outgoing invocation lifetime for one complete Session Incarnation. */
export const createRpcSessionInvocations: RpcSessionInvocationsFactory = (
	options,
) => new RpcSessionInvocationsImpl(options);
