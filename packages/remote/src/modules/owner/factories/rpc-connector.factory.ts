/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	createRpcOwnerProtocolConnector,
	createRpcOwnerResources,
	parseRpcOwnerPolicy,
} from "@/modules/owner/factories/rpc-owner-assembly.factory";
import { createRpcOwnerTermination } from "@/modules/owner/factories/rpc-owner-termination.factory";
import { createRpcConnectorSessionOwnership } from "@/modules/owner/factories/rpc-session-ownership.factory";
import { RpcConnectorImpl } from "@/modules/owner/impls/rpc-connector.impl";
import { RpcConnectorPublisherImpl } from "@/modules/owner/impls/rpc-owner-publisher.impl";
import type { IRpcConnector } from "@/modules/owner/interfaces/rpc-connector.interface";
import {
	type RpcConnectorOptions,
	rpcConnectorOptionsSchema,
} from "@/modules/owner/types/rpc-caller.type";
import type {
	IRpcProtocolRuntimePolicy,
	RpcProtocolConnectorFactory,
} from "@/modules/protocol";
import {
	createRpcProtocolConnector,
	DEFAULT_RPC_RUNTIME_POLICY,
} from "@/modules/protocol";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

/** Creates a cold Connector without starting transport I/O. */
export function createRpcConnector(
	options?: RpcConnectorOptions,
): IRpcConnector {
	const parsed = parseConnectorOptions(options);
	return new RpcConnectorImpl({
		createProtocol: (ports) =>
			createRpcOwnerProtocolConnector(
				parsed.policy,
				parsed.protocolFactory === undefined
					? createRpcProtocolConnector
					: parsed.protocolFactory,
				ports,
			),
		policy: parsed.policy,
		publisher: new RpcConnectorPublisherImpl({
			initialState: Object.freeze({ status: RpcStateStatusEnum.active }),
		}),
		...createRpcOwnerResources(parsed.policy),
		createSessionOwnership: createRpcConnectorSessionOwnership,
		createTermination: createRpcOwnerTermination,
	});
}

function parseConnectorOptions(options: RpcConnectorOptions | undefined): {
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly protocolFactory: RpcProtocolConnectorFactory | undefined;
} {
	const optionsResult = rpcConnectorOptionsSchema.safeParse(
		options === undefined ? {} : options,
	);
	if (!optionsResult.success) {
		throw new TypeError(optionsResult.error.message, {
			cause: optionsResult.error,
		});
	}
	const { protocolFactory, runtimePolicy } = optionsResult.data;
	const policy = parseRpcOwnerPolicy({
		...DEFAULT_RPC_RUNTIME_POLICY,
		...runtimePolicy,
		maxSessions: 1,
		maxHandshakes: 1,
		maxRetainedBytesTotal: runtimePolicy.maxRetainedBytesPerSession,
		maxHandlersTotal: runtimePolicy.maxHandlersPerSession,
	});
	return { policy, protocolFactory };
}
