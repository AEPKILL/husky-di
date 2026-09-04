/**
 * @overview Creates an opt-in Connector Reconnection supervisor.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import { RpcConnectorReconnectionImpl } from "@/impls/reconnection/rpc-connector-reconnection.impl";
import type { IRpcConnectorReconnection } from "@/interfaces/reconnection/rpc-connector-reconnection.interface";
import {
	type CreateRpcConnectorReconnectionOptions,
	rpcConnectorReconnectionOptionsSchema,
} from "@/types/reconnection/rpc-connector-reconnection.type";

/** Creates a cold, single-use Connector Reconnection supervisor. */
export function createRpcConnectorReconnection(
	options: CreateRpcConnectorReconnectionOptions,
): IRpcConnectorReconnection {
	const result = rpcConnectorReconnectionOptionsSchema.safeParse(options);
	if (!result.success) {
		throw new TypeError(result.error.message, { cause: result.error });
	}
	const { adapterFactory, connector, policy } = result.data;
	return new RpcConnectorReconnectionImpl(connector, adapterFactory, policy);
}
