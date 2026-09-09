/**
 * @overview Private Topology Owner resource-custody and cleanup contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcConnection } from "@/modules/transport";

export type RpcOwnerCustodyFactory = (
	cleanupProtocol: () => unknown,
) => IRpcOwnerCustody;

export type RpcOwnedConnection = {
	readonly connection: IRpcConnection;
	directClose(): Promise<void>;
};

export type RpcOwnedCleanup = {
	start(): Promise<void>;
};

export interface IRpcOwnerCustody {
	readonly connectionCount: number;
	ownConnection(connection: IRpcConnection): RpcOwnedConnection;
	ownCleanup(cleanup: () => unknown): RpcOwnedCleanup;
	finishCleanup(): Promise<void>;
}
