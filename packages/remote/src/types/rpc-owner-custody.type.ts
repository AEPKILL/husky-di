/**
 * @overview RPC Topology Owner resource-custody capabilities.
 * @author AEPKILL
 * @created 2026-08-22 15:32:32
 */

import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";

export type RpcOwnedConnection = {
	readonly connection: IRpcConnection;
	directClose(): Promise<void>;
};

export type RpcOwnedCleanup = {
	start(): Promise<void>;
};
