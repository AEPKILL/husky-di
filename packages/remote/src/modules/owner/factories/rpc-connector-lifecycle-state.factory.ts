/**
 * @overview Creates the cold Owner and Peer lifecycle state boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { RpcConnectorLifecycleStateImpl } from "@/modules/owner/impls/rpc-connector-lifecycle-state.impl";
import type { IRpcConnectorLifecycleState } from "@/modules/owner/interfaces/rpc-connector-lifecycle-state.interface";

export function createRpcConnectorLifecycleState(): IRpcConnectorLifecycleState {
	return new RpcConnectorLifecycleStateImpl();
}
