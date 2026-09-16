/**
 * @overview Browser example lifetime and observable RPC owners.
 * @author AEPKILL
 * @created 2026-09-09 23:59:09
 */

import type {
	IRpcConnector,
	IRpcConnectorReconnection,
} from "@husky-di/remote";
import type { ILabTraceContext } from "@/interfaces/lab-trace-context.interface";

export interface IExampleClient {
	readonly connector: IRpcConnector;
	readonly reconnection: IRpcConnectorReconnection;
	readonly traceContext: ILabTraceContext;
	shutdown(): Promise<void>;
}
