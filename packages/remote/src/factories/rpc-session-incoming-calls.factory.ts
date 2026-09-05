/**
 * @overview Assembles private incoming call ownership for one Logical Session.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcSessionIncomingCallsImpl } from "@/impls/session/rpc-session-incoming-calls.impl";
import type { RpcSessionIncomingCallsFactory } from "@/interfaces/session/rpc-session-incoming-calls.interface";

/** Creates incoming admission and terminal publication for one Session Incarnation. */
export const createRpcSessionIncomingCalls: RpcSessionIncomingCallsFactory = (
	options,
) => new RpcSessionIncomingCallsImpl(options);
