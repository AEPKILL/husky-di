/**
 * @overview Creates a cold RPC Connector Topology Owner.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { DEFAULT_RPC_RUNTIME_POLICY } from "@/constants/protocol/rpc-runtime-policy.const";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import {
	createRpcOwnerProtocolException,
	createRpcOwnerProtocolHost,
	createRpcOwnerResources,
	parseRpcOwnerPolicy,
	validateRpcOwnerProtocol,
} from "@/factories/rpc-owner-assembly.factory";
import { createRpcProtocolConnector } from "@/factories/rpc-protocol.factory";
import { createRpcConnectorSessionOwnership } from "@/factories/rpc-session-ownership.factory";
import { RpcConnectorImpl } from "@/impls/owner/rpc-connector.impl";
import { RpcConnectorPublisherImpl } from "@/impls/owner/rpc-owner-publisher.impl";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type {
	IRpcProtocolConnector,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import {
	type RpcConnectorOptions,
	rpcConnectorOptionsSchema,
} from "@/types/common/rpc-caller.type";
import type { RpcProtocolConnectorFactory } from "@/types/protocol/rpc-protocol-factory.type";
import { isCallable } from "@/utils/type-guard.util";

/** Creates a cold Connector without starting transport I/O. */
export function createRpcConnector(
	options?: RpcConnectorOptions,
): IRpcConnector {
	const parsed = parseConnectorOptions(options);
	const construction = createRpcOwnerProtocolHost<IRpcConnectorProtocolPorts>(
		parsed.policy,
	);
	let protocol: IRpcProtocolConnector;
	try {
		const factory =
			parsed.protocolFactory === undefined
				? createRpcProtocolConnector
				: parsed.protocolFactory;
		if (!isCallable(factory)) {
			throw new TypeError("protocolFactory must be callable.");
		}
		protocol = factory(
			Object.freeze({
				...construction.host,
				attachSession: (session: IRpcProtocolSession) =>
					construction.readDuringRuntime(
						(owner) => owner.attachSession(session),
						undefined,
					),
			}),
		);
		validateRpcOwnerProtocol(protocol, [
			"bind",
			"shutdown",
			"close",
			"cleanup",
		]);
		construction.assertConstructionSafe();
	} catch (error) {
		throw createRpcOwnerProtocolException(error);
	}
	const owner = new RpcConnectorImpl({
		protocol,
		policy: parsed.policy,
		publisher: new RpcConnectorPublisherImpl({
			initialState: Object.freeze({ status: RpcStateStatusEnum.active }),
		}),
		...createRpcOwnerResources(parsed.policy, protocol),
		createSessionOwnership: createRpcConnectorSessionOwnership,
	});
	construction.activate(owner);
	return owner;
}

interface IRpcConnectorProtocolPorts {
	reserveRetainedBytes(bytes: number): IRpcRetainedBytesReservation | undefined;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined;
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
