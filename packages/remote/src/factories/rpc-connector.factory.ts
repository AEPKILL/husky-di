/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { DEFAULT_RPC_RUNTIME_POLICY } from "@/constants/protocol/rpc-runtime-policy.const";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import { createRpcPeer } from "@/factories/rpc-peer.factory";
import { createRpcProtocolConnector } from "@/factories/rpc-protocol.factory";
import { RpcRetainedBytesLedgerImpl } from "@/impls/common/rpc-retained-bytes-ledger.impl";
import { RpcConnectorImpl } from "@/impls/owner/rpc-connector.impl";
import { RpcHandlerSchedulerImpl } from "@/impls/owner/rpc-handler-scheduler.impl";
import { RpcOwnerCustodyImpl } from "@/impls/owner/rpc-owner-custody.impl";
import { RpcConnectorPublisherImpl } from "@/impls/owner/rpc-owner-publisher.impl";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type { IRpcProtocolConnector } from "@/interfaces/protocol/rpc-protocol.interface";
import {
	type RpcConnectorOptions,
	rpcConnectorOptionsSchema,
} from "@/types/common/rpc-caller.type";
import { rpcProtocolRuntimePolicySchema } from "@/types/protocol/rpc-runtime-policy.type";
import { createRpcProtocolConnectorForOwner } from "@/utils/rpc-protocol-role.util";

/** Creates a cold Connector without starting transport I/O. */
export function createRpcConnector(
	options?: RpcConnectorOptions,
): IRpcConnector {
	const optionsResult = rpcConnectorOptionsSchema.safeParse(
		options === undefined ? {} : options,
	);
	if (!optionsResult.success) {
		throw new TypeError(optionsResult.error.message, {
			cause: optionsResult.error,
		});
	}
	const { protocolFactory, runtimePolicy } = optionsResult.data;
	const policyResult = rpcProtocolRuntimePolicySchema.safeParse({
		...DEFAULT_RPC_RUNTIME_POLICY,
		...runtimePolicy,
		maxSessions: 1,
		maxHandshakes: 1,
		maxRetainedBytesTotal: runtimePolicy.maxRetainedBytesPerSession,
		maxHandlersTotal: runtimePolicy.maxHandlersPerSession,
	});
	if (!policyResult.success) {
		throw new TypeError(policyResult.error.message, {
			cause: policyResult.error,
		});
	}
	const policy = policyResult.data;
	let connector: RpcConnectorImpl | undefined;
	let protocol: IRpcProtocolConnector;
	try {
		protocol = createRpcProtocolConnectorForOwner(
			protocolFactory === undefined
				? createRpcProtocolConnector
				: protocolFactory,
			policy,
			{
				reserveRetainedBytes: (bytes) => connector?.reserveRetainedBytes(bytes),
				attachSession: (session) => connector?.attachSession(session),
				fault: (reason, error) => connector?.protocolFault(reason, error),
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
	connector = new RpcConnectorImpl({
		protocol,
		policy,
		publisher: new RpcConnectorPublisherImpl({
			initialState: Object.freeze({ status: RpcStateStatusEnum.active }),
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
	return connector;
}
