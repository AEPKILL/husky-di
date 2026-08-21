/**
 * @overview Owns the example's shared RPC Connector Reconnection lifecycle.
 * @author AEPKILL
 * @created 2026-08-21 20:43:25
 */

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcConnectorReconnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { useEffect, useState } from "react";

type RpcConnectorReconnectionFactory = (
	options: CreateRpcConnectorReconnectionOptions,
) => IRpcConnectorReconnection;

export function useRpcConnectorReconnection(
	initialConnector: IRpcConnector,
): string | undefined {
	const [connector] = useState(() => initialConnector);
	const [initialConnectionError, setInitialConnectionError] =
		useState<string>();

	useEffect(() => {
		const stop = startRpcConnectorReconnection(
			connector,
			createBrowserRpcConnectorAdapter,
			(error) => {
				setInitialConnectionError(
					error instanceof Error ? error.message : String(error),
				);
			},
		);

		return () => {
			void stop();
		};
	}, [connector]);

	return initialConnectionError;
}

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
		await connector.close();
	};
}

function createBrowserRpcConnectorAdapter() {
	const url = new URL("/rpc", window.location.href);
	url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return createWebSocketConnectorAdapter({ url });
}
