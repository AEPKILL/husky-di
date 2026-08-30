/**
 * @overview Public caller-facing RPC Connector contract.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable } from "rxjs";

import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	RpcConnectorConnectOptions,
	RpcConnectorState,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";

export interface IRpcConnector {
	readonly state: RpcConnectorState;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeer;
	connect(options: RpcConnectorConnectOptions): Promise<void>;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}
