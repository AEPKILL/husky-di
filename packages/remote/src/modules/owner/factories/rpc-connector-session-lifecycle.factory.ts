/**
 * @overview Assembles the Connector's stable Peer and Session lifecycle ownership.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { RpcConnectorSessionLifecycleImpl } from "@/modules/owner/impls/rpc-connector-session-lifecycle.impl";
import type { RpcConnectorSessionLifecycleFactory } from "@/modules/owner/interfaces/rpc-connector-session-lifecycle.interface";

export const createRpcConnectorSessionLifecycle: RpcConnectorSessionLifecycleFactory =
	(options) => new RpcConnectorSessionLifecycleImpl(options);
