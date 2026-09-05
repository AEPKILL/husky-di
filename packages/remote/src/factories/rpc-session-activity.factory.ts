/**
 * @overview Assembles private Activity Probe ownership for one Binding Activation.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcSessionActivityImpl } from "@/impls/session/rpc-session-activity.impl";
import type { RpcSessionActivityFactory } from "@/interfaces/session/rpc-session-activity.interface";

/** Creates a cold Activity Probe lifetime with immutable timing policy. */
export const createRpcSessionActivity: RpcSessionActivityFactory = (options) =>
	new RpcSessionActivityImpl(options);
