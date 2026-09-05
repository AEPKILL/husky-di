/**
 * @overview Assembles private incoming-call and replay retention for a Logical Session.
 * @author AEPKILL
 * @created 2026-09-05 15:00:00
 */

import { RpcSessionCallRetentionImpl } from "@/impls/session/rpc-session-call-retention.impl";
import type { RpcSessionCallRetentionFactory } from "@/interfaces/session/rpc-session-call-retention.interface";

/** Creates one retention owner for the complete Session Incarnation. */
export const createRpcSessionCallRetention: RpcSessionCallRetentionFactory = (
	options,
) => new RpcSessionCallRetentionImpl(options);
