/**
 * @overview Public behavioral Connector Reconnection supervisor contract.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27 02:14:00
 */

import type { Observable } from "rxjs";

import type { IRpcConnector } from "@/modules/owner";
import type {
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionState,
} from "@/modules/reconnection/types/rpc-connector-reconnection.type";

export interface IRpcConnectorReconnection {
	readonly connector: IRpcConnector;
	readonly state: RpcConnectorReconnectionState;
	readonly state$: Observable<RpcConnectorReconnectionState>;
	readonly event$: Observable<RpcConnectorReconnectionEvent>;

	connect(): Promise<void>;
	stop(): Promise<void>;
}
