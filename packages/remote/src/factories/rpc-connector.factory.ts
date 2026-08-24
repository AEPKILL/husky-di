/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createRpcProtocol } from "@/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/protocol/rpc-retained-bytes-ledger.impl";
import { RpcApplicationWorkLedgerImpl } from "@/impls/rpc-application-work-ledger.impl";
import { RpcConnectorImpl } from "@/impls/rpc-connector.impl";
import { RpcEventPublisherImpl } from "@/impls/rpc-event-publisher.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/rpc-owner-custody.impl";
import { RpcPeerImpl } from "@/impls/rpc-peer.impl";
import type { IRpcConnector } from "@/interfaces/rpc-caller.interface";
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
		applicationWorkLedger: new RpcApplicationWorkLedgerImpl(
			policy.maxApplicationWorkTotal,
			policy.maxActiveStreamsTotal,
		),
		runtime,
		policy,
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			policy.maxRetainedBytesTotal,
		),
		custody: new RpcOwnerCustodyImpl(policy.shutdownDeadlineMs, () =>
			runtime.cleanup(),
		),
		eventPublisher: new RpcEventPublisherImpl(),
		handlerScheduler: new RpcHandlerSchedulerImpl(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		),
		createPeer: (peerOptions) => new RpcPeerImpl(peerOptions),
	});
	return connector;
}
