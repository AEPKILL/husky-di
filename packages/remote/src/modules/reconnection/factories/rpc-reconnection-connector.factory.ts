/**
 * @overview Creates a cold Connector with opt-in Reconnection supervision.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27 02:14:00
 */

import { createRpcConnector } from "@/modules/owner";
import { RpcConnectorReconnectionImpl } from "@/modules/reconnection/impls/rpc-connector-reconnection.impl";
import type { IRpcConnectorReconnection } from "@/modules/reconnection/interfaces/rpc-connector-reconnection.interface";
import {
	type CreateRpcReconnectionConnectorOptions,
	rpcConnectorReconnectionOptionsSchema,
} from "@/modules/reconnection/types/rpc-connector-reconnection.type";

/** Creates a cold Connector and its single-use Reconnection supervisor. */
export function createRpcReconnectionConnector(
	options: CreateRpcReconnectionConnectorOptions,
): IRpcConnectorReconnection {
	const result = rpcConnectorReconnectionOptionsSchema.safeParse(options);
	if (!result.success) {
		throw new TypeError(result.error.message, { cause: result.error });
	}
	const { adapterFactory, policy, ...connectorOptions } = result.data;
	const connector = createRpcConnector(connectorOptions);
	return new RpcConnectorReconnectionImpl(connector, adapterFactory, policy);
}
