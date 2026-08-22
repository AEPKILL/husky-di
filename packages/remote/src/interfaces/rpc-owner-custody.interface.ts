/**
 * @overview Private Topology Owner resource-custody contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type {
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/types/rpc-owner-custody.type";

export interface IRpcOwnerCustody {
	readonly connectionCount: number;
	ownConnection(connection: IRpcConnection): RpcOwnedConnection;
	ownCleanup(cleanup: () => unknown): RpcOwnedCleanup;
	finishCleanup(): Promise<void>;
}
