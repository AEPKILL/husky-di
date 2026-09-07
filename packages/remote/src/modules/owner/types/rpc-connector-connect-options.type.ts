/**
 * @overview Caller-facing options for one RPC Connector connection attempt.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnectorAdapter } from "@/modules/transport";

export type RpcConnectorConnectOptions = {
	readonly adapter: IRpcConnectorAdapter;
	readonly signal?: AbortSignal | undefined;
};
