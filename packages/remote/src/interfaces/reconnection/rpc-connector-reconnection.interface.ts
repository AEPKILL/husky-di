/**
 * @overview Public behavioral Connector Reconnection supervisor contract.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import type { Observable } from "rxjs";

import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type {
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionState,
} from "@/types/reconnection/rpc-connector-reconnection.type";

export interface IRpcConnectorReconnection {
	readonly connector: IRpcConnector;
	readonly state: RpcConnectorReconnectionState;
	readonly state$: Observable<RpcConnectorReconnectionState>;
	readonly event$: Observable<RpcConnectorReconnectionEvent>;

	connect(): Promise<void>;
	stop(): Promise<void>;
}
