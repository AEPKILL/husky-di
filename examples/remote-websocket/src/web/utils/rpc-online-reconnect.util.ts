/**
 * @overview Coordinates initial and browser-online RPC connection attempts.
 * @author AEPKILL
 * @created 2026-08-21 00:55:52
 */

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcConnectorReconnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
	RpcStateStatusEnum,
} from "@husky-di/remote";

interface IRpcOnlineEvents {
	addEventListener(type: "online", listener: () => void): void;
	removeEventListener(type: "online", listener: () => void): void;
}

type RpcConnectorReconnectionFactory = (
	options: CreateRpcConnectorReconnectionOptions,
) => IRpcConnectorReconnection;

export function connectRpcPeerOnOnline(
	connector: IRpcConnector,
	createAdapter: () => IRpcConnectorAdapter,
	setConnectionError: (error: unknown | undefined) => void,
	onlineEvents: IRpcOnlineEvents = window,
	createReconnection: RpcConnectorReconnectionFactory = createRpcConnectorReconnection,
): () => void {
	let active = true;
	let reconnection: IRpcConnectorReconnection | undefined;
	let initialAttempt: Promise<void> | undefined;
	const connect = (): void => {
		if (
			!active ||
			initialAttempt !== undefined ||
			reconnection !== undefined ||
			connector.peer.state.status !== RpcStateStatusEnum.unbound
		) {
			return;
		}

		setConnectionError(undefined);
		const nextReconnection = createReconnection({
			connector,
			adapterFactory: createAdapter,
		});
		reconnection = nextReconnection;
		let attempt: Promise<void>;
		try {
			attempt = nextReconnection.connect();
		} catch (error) {
			reconnection = undefined;
			setConnectionError(error);
			return;
		}
		initialAttempt = attempt;
		void attempt
			.catch((error: unknown) => {
				if (active && reconnection === nextReconnection) {
					reconnection = undefined;
					setConnectionError(error);
				}
			})
			.finally(() => {
				if (initialAttempt === attempt) {
					initialAttempt = undefined;
				}
			});
	};

	onlineEvents.addEventListener("online", connect);
	connect();
	return () => {
		active = false;
		onlineEvents.removeEventListener("online", connect);
		const currentReconnection = reconnection;
		reconnection = undefined;
		void currentReconnection?.stop();
	};
}
