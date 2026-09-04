/**
 * @overview Creates a cold RPC Acceptor Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import { createRpcPeer } from "@/factories/rpc-peer.factory";
import { createRpcProtocolAcceptor } from "@/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcAcceptorImpl } from "@/impls/owner/rpc-acceptor.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/owner/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/owner/rpc-owner-custody.impl";
import { RpcAcceptorPublisherImpl } from "@/impls/owner/rpc-owner-publisher.impl";
import type { IRpcAcceptor } from "@/interfaces/owner/rpc-acceptor.interface";
import type { IRpcProtocolAcceptor } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcAcceptorOptions } from "@/types/common/rpc-caller.type";
import { createRpcProtocolAcceptorForOwner } from "@/utils/rpc-protocol-role.util";
import {
	createRpcAcceptorRuntimePolicy,
	snapshotRpcFactoryOptions,
} from "@/utils/rpc-runtime-policy.util";

/** Creates a cold Acceptor without starting transport I/O. */
export function createRpcAcceptor(options?: RpcAcceptorOptions): IRpcAcceptor {
	const snapshot = snapshotRpcFactoryOptions(options);
	const policy = createRpcAcceptorRuntimePolicy(snapshot.runtimePolicy);
	let acceptor: RpcAcceptorImpl | undefined;
	let protocol: IRpcProtocolAcceptor;
	try {
		protocol = createRpcProtocolAcceptorForOwner(
			snapshot.protocolFactory ?? createRpcProtocolAcceptor,
			policy,
			{
				reserveRetainedBytes: (bytes) => acceptor?.reserveRetainedBytes(bytes),
				admitSession: (session) => acceptor?.admitProtocolSession(session),
				fault: (reason, error) => acceptor?.protocolFault(reason, error),
			},
		);
	} catch (error) {
		throw createRpcException(
			RpcExceptionCodeEnum.protocol,
			error instanceof Error
				? error
				: new Error("Protocol construction failed."),
		);
	}
	acceptor = new RpcAcceptorImpl({
		protocol,
		policy,
		publisher: new RpcAcceptorPublisherImpl({
			initialState: Object.freeze({
				status: RpcStateStatusEnum.active,
				listener: Object.freeze({ status: RpcStateStatusEnum.idle }),
			}),
		}),
		retainedBytesLedger: new RpcRetainedBytesLedgerImpl(
			policy.maxRetainedBytesTotal,
		),
		custody: new RpcOwnerCustodyImpl(policy.shutdownDeadlineMs, () =>
			protocol.cleanup(),
		),
		handlerScheduler: new RpcHandlerSchedulerImpl(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		),
		createPeer: createRpcPeer,
	});
	return acceptor;
}
