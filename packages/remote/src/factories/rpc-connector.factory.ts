/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcConnectorImpl } from "@/impls/rpc-connector.impl";
import type { IRpcConnector } from "@/interfaces/rpc-caller.interface";
import type { RpcConnectorOptions } from "@/types/rpc-caller.type";
import {
	createRpcProtocolConnectorRuntime,
	resolveRpcProtocol,
} from "@/utils/rpc-protocol-runtime.util";
import {
	createRpcConnectorRuntimePolicy,
	snapshotRpcFactoryOptions,
} from "@/utils/rpc-runtime-policy.util";

/** Creates a cold Connector without starting transport I/O. */
export function createRpcConnector(
	options?: RpcConnectorOptions,
): IRpcConnector {
	const snapshot = snapshotRpcFactoryOptions(options);
	const policy = createRpcConnectorRuntimePolicy(snapshot.runtimePolicy);
	let connector: RpcConnectorImpl | undefined;
	const runtime = createRpcProtocolConnectorRuntime(
		resolveRpcProtocol(snapshot.protocol),
		policy,
		{
			reserveRetainedBytes: (bytes) => connector?.reserveRetainedBytes(bytes),
			attachSession: (session) => connector?.attachProtocolSession(session),
			fault: (reason, error) => connector?.protocolFault(reason, error),
		},
	);
	connector = new RpcConnectorImpl(runtime, policy);
	return connector;
}
