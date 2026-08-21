/**
 * @overview Starts and stops the example's shared RPC Connector Reconnection supervisor.
 * @author AEPKILL
 * @created 2026-08-21 09:30:06
 */

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcConnectorReconnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
} from "@husky-di/remote";

type RpcConnectorReconnectionFactory = (
	options: CreateRpcConnectorReconnectionOptions,
) => IRpcConnectorReconnection;

export function startRpcConnectorReconnection(
	connector: IRpcConnector,
	adapterFactory: () => IRpcConnectorAdapter,
	setInitialConnectionError: (error: unknown) => void,
	createReconnection: RpcConnectorReconnectionFactory = createRpcConnectorReconnection,
): () => Promise<void> {
	let active = true;
	const reconnection = createReconnection({ connector, adapterFactory });
	void reconnection.connect().catch((error: unknown) => {
		if (active) {
			setInitialConnectionError(error);
		}
	});

	return async () => {
		active = false;
		await reconnection.stop();
	};
}
