/**
 * @overview Creates a cold RPC Acceptor Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createRpcProtocol } from "@/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/protocol/rpc-retained-bytes-ledger.impl";
import { RpcAcceptorImpl } from "@/impls/rpc-acceptor.impl";
import { RpcApplicationWorkLedgerImpl } from "@/impls/rpc-application-work-ledger.impl";
import { RpcEventPublisherImpl } from "@/impls/rpc-event-publisher.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/rpc-owner-custody.impl";
import { RpcPeerImpl } from "@/impls/rpc-peer.impl";
import type { IRpcAcceptor } from "@/interfaces/rpc-caller.interface";
import type { RpcAcceptorOptions } from "@/types/rpc-caller.type";
import { createRpcProtocolAcceptorRuntime } from "@/utils/rpc-protocol-runtime.util";
import {
	createRpcAcceptorRuntimePolicy,
	snapshotRpcFactoryOptions,
} from "@/utils/rpc-runtime-policy.util";

/** Creates a cold Acceptor without starting transport I/O. */
export function createRpcAcceptor(options?: RpcAcceptorOptions): IRpcAcceptor {
	const snapshot = snapshotRpcFactoryOptions(options);
	const policy = createRpcAcceptorRuntimePolicy(snapshot.runtimePolicy);
	let acceptor: RpcAcceptorImpl | undefined;
	const runtime = createRpcProtocolAcceptorRuntime(
		snapshot.protocol ?? createRpcProtocol(),
		policy,
		{
			reserveRetainedBytes: (bytes) => acceptor?.reserveRetainedBytes(bytes),
			admitSession: (session) => acceptor?.admitProtocolSession(session),
			fault: (reason, error) => acceptor?.protocolFault(reason, error),
		},
	);
	acceptor = new RpcAcceptorImpl({
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
	return acceptor;
}
