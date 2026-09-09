/**
 * @overview Browser example lifetime and observable RPC owners.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	IRpcConnector,
	IRpcConnectorReconnection,
} from "@husky-di/remote";

export interface IExampleClient {
	readonly connector: IRpcConnector;
	readonly reconnection: IRpcConnectorReconnection;
	shutdown(): Promise<void>;
}
