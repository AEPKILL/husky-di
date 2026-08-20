/**
 * @overview Coordinates initial and browser-online RPC connection attempts.
 * @author AEPKILL
 * @created 2026-08-21 00:55:52
 */

import {
	type IRpcConnector,
	type IRpcConnectorAdapter,
	RpcStateStatusEnum,
} from "@husky-di/remote";

interface IRpcOnlineEvents {
	addEventListener(type: "online", listener: () => void): void;
	removeEventListener(type: "online", listener: () => void): void;
}

export function connectRpcPeerOnOnline(
	connector: IRpcConnector,
	createAdapter: () => IRpcConnectorAdapter,
	setConnectionError: (error: unknown | undefined) => void,
	onlineEvents: IRpcOnlineEvents = window,
): () => void {
	let active = true;
	let currentAttempt: Promise<void> | undefined;
	const connect = (): void => {
		const status = connector.peer.state.status;
		if (
			!active ||
			currentAttempt !== undefined ||
			(status !== RpcStateStatusEnum.unbound &&
				status !== RpcStateStatusEnum.recovering)
		) {
			return;
		}

		setConnectionError(undefined);
		let attempt: Promise<void>;
		try {
			attempt = connector.connect(createAdapter());
		} catch (error) {
			setConnectionError(error);
			return;
		}
		currentAttempt = attempt;
		void attempt
			.catch((error: unknown) => {
				if (active) {
					setConnectionError(error);
				}
			})
			.finally(() => {
				if (currentAttempt === attempt) {
					currentAttempt = undefined;
				}
			});
	};

	onlineEvents.addEventListener("online", connect);
	connect();
	return () => {
		active = false;
		onlineEvents.removeEventListener("online", connect);
	};
}
