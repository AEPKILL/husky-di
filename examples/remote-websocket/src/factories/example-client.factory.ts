/**
 * @overview Assembles one retained Connector and reconnection supervisor per browser lifetime.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import {
	createRpcConnector,
	createRpcConnectorReconnection,
	type RpcConnectorAdapterFactory,
} from "@husky-di/remote";
import { REMOTE_BROWSER_DISPLAY_SERVICE } from "@/consts/remote-services.const";
import type { IBrowserDisplayService } from "@/interfaces/browser-display-service.interface";
import type { IExampleClient } from "@/interfaces/example-client.interface";

export type CreateExampleClientOptions = {
	readonly adapterFactory: RpcConnectorAdapterFactory;
	readonly display: IBrowserDisplayService;
};

export function createExampleClient(
	options: CreateExampleClientOptions,
): IExampleClient {
	const connector = createRpcConnector();
	connector.peer.expose(REMOTE_BROWSER_DISPLAY_SERVICE, options.display);
	const reconnection = createRpcConnectorReconnection({
		connector,
		adapterFactory: options.adapterFactory,
		policy: {
			retryDelaysMs: [500, 1_000, 2_000, 5_000],
			attemptTimeoutMs: 3_000,
		},
	});
	let shutdownTask: Promise<void> | undefined;
	return {
		connector,
		reconnection,
		shutdown() {
			shutdownTask ??= reconnection.stop().finally(() => connector.shutdown());
			return shutdownTask;
		},
	};
}
