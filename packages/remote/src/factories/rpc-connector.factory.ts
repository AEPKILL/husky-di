/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createRpcProtocol } from "@/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcConnectorImpl } from "@/impls/owner/rpc-connector.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/owner/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/owner/rpc-owner-custody.impl";
import { RpcPeerImpl } from "@/impls/peer/rpc-peer.impl";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type { RpcConnectorOptions } from "@/types/rpc-caller.type";
import { createRpcProtocolConnectorRuntime } from "@/utils/rpc-protocol-runtime.util";
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
		snapshot.protocol ?? createRpcProtocol(),
		policy,
		{
			reserveRetainedBytes: (bytes) => connector?.reserveRetainedBytes(bytes),
			attachSession: (session) => connector?.attachProtocolSession(session),
			fault: (reason, error) => connector?.protocolFault(reason, error),
		},
	);
	connector = new RpcConnectorImpl({
		runtime,
		policy,
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			policy.maxRetainedBytesTotal,
		),
		custody: new RpcOwnerCustodyImpl(policy.shutdownDeadlineMs, () =>
			runtime.cleanup(),
		),
		handlerScheduler: new RpcHandlerSchedulerImpl(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		),
		createPeer: (peerOptions) => new RpcPeerImpl(peerOptions),
	});
	return connector;
}
