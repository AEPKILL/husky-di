/**
 * @overview Owns the example's manually interruptible Connector Reconnection lifecycle.
 * @author AEPKILL
 * @created 2026-08-21 20:43:25
 */

import {
	type CreateRpcConnectorReconnectionOptions,
	createRpcConnectorReconnection,
	type IRpcConnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcConnectorReconnection,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { useEffect, useRef, useState } from "react";

type RpcConnectorReconnectionFactory = (
	options: CreateRpcConnectorReconnectionOptions,
) => IRpcConnectorReconnection;

type RpcConnectorReconnectionControls = {
	readonly disconnect: () => Promise<void>;
	readonly recover: () => Promise<void>;
	readonly stop: () => Promise<void>;
};

export function useRpcConnectorReconnection(initialConnector: IRpcConnector): {
	readonly connectionError: string | undefined;
	readonly disconnectTransport: () => void;
	readonly manualRecoveryReady: boolean;
	readonly recoverTransport: () => void;
	readonly transportOperationPending: boolean;
} {
	const [connector] = useState(() => initialConnector);
	const [connectionError, setConnectionError] = useState<string>();
	const [manualRecoveryReady, setManualRecoveryReady] = useState(false);
	const [transportOperationPending, setTransportOperationPending] =
		useState(false);
	const disconnectRef = useRef<() => Promise<void>>(() => Promise.resolve());
	const recoverRef = useRef<() => Promise<void>>(() => Promise.resolve());
	const operationRef = useRef<Promise<void> | undefined>(undefined);
	const mountedRef = useRef(false);

	useEffect(() => {
		mountedRef.current = true;
		const controls = startRpcConnectorReconnection(
			connector,
			createBrowserRpcConnectorAdapter,
			(error) => {
				setConnectionError(
					error instanceof Error ? error.message : String(error),
				);
			},
		);
		disconnectRef.current = controls.disconnect;
		recoverRef.current = controls.recover;

		return () => {
			mountedRef.current = false;
			disconnectRef.current = () => Promise.resolve();
			recoverRef.current = () => Promise.resolve();
			operationRef.current = undefined;
			void controls.stop();
		};
	}, [connector]);

	return {
		connectionError,
		disconnectTransport: () => {
			runTransportOperation(disconnectRef.current, () => {
				setManualRecoveryReady(true);
			});
		},
		manualRecoveryReady,
		recoverTransport: () => {
			runTransportOperation(recoverRef.current, () => {
				setManualRecoveryReady(false);
			});
		},
		transportOperationPending,
	};

	function runTransportOperation(
		operation: () => Promise<void>,
		onSuccess: () => void,
	): void {
		if (operationRef.current !== undefined) {
			return;
		}
		setConnectionError(undefined);
		setTransportOperationPending(true);
		const task = Promise.resolve().then(operation);
		operationRef.current = task;
		void task.then(
			() => {
				if (operationRef.current !== task) {
					return;
				}
				operationRef.current = undefined;
				if (mountedRef.current) {
					onSuccess();
					setTransportOperationPending(false);
				}
			},
			(error: unknown) => {
				if (operationRef.current !== task) {
					return;
				}
				operationRef.current = undefined;
				if (mountedRef.current) {
					setConnectionError(
						error instanceof Error ? error.message : String(error),
					);
					setTransportOperationPending(false);
				}
			},
		);
	}
}

export function startRpcConnectorReconnection(
	connector: IRpcConnector,
	adapterFactory: () => IRpcConnectorAdapter,
	setConnectionError: (error: unknown) => void,
	createReconnection: RpcConnectorReconnectionFactory = createRpcConnectorReconnection,
): RpcConnectorReconnectionControls {
	let active = true;
	let connection: IRpcConnection | undefined;
	let reconnection: IRpcConnectorReconnection;
	let operationTask: Promise<void> | undefined;
	let stopTask: Promise<void> | undefined;

	function createTrackedAdapter(): IRpcConnectorAdapter {
		const adapter = adapterFactory();
		adapter.connection$.subscribe({
			next: (nextConnection) => {
				connection = nextConnection;
			},
			error: () => {
				// The Connector Reconnection supervisor owns attempt failures.
			},
		});
		return adapter;
	}

	function startReconnection(): Promise<void> {
		const nextReconnection = createReconnection({
			connector,
			adapterFactory: createTrackedAdapter,
		});
		reconnection = nextReconnection;
		return nextReconnection.connect();
	}

	function runOperation(operation: () => Promise<void>): Promise<void> {
		if (!active) {
			return Promise.resolve();
		}
		if (operationTask !== undefined) {
			return operationTask;
		}
		const task = Promise.resolve().then(operation);
		operationTask = task;
		void task.then(
			() => {
				if (operationTask === task) {
					operationTask = undefined;
				}
			},
			() => {
				if (operationTask === task) {
					operationTask = undefined;
				}
			},
		);
		return task;
	}

	void startReconnection().catch((error: unknown) => {
		if (active) {
			setConnectionError(error);
		}
	});

	return {
		disconnect: () =>
			runOperation(async () => {
				await reconnection.stop();
				const currentConnection = connection;
				connection = undefined;
				try {
					await currentConnection?.close();
				} catch (error) {
					// Released supervisor authority must not strand manual Recovery.
					if (active) {
						setConnectionError(error);
					}
				}
			}),
		recover: () =>
			runOperation(() => {
				if (!active) {
					return Promise.resolve();
				}
				return startReconnection();
			}),
		stop: () => {
			active = false;
			if (stopTask !== undefined) {
				return stopTask;
			}
			const currentReconnection = reconnection;
			stopTask = (async () => {
				await currentReconnection.stop();
				await operationTask?.catch(() => {});
				connection = undefined;
				await connector.close();
			})();
			return stopTask;
		},
	};
}

function createBrowserRpcConnectorAdapter() {
	const url = new URL("/rpc", window.location.href);
	url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return createWebSocketConnectorAdapter({ url });
}
