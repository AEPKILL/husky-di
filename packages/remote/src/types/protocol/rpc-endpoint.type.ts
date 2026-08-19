/**
 * @overview Internal Endpoint creation inputs and failure reasons.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";

export type RpcEndpointFailure = "connection" | "protocol" | "resource";

export type CreateRpcEndpointOptions = {
	readonly connection: IRpcConnection;
	readonly onMessage: (message: Uint8Array) => Promise<void> | void;
	readonly onFailure: (reason: RpcEndpointFailure, error?: Error) => void;
};
