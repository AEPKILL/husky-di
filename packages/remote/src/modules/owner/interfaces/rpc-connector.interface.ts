/**
 * @overview Public caller-facing RPC Connector contract.
 * @author AEPKILL
 * @created 2026-09-07 23:22:09
 */

import type { Observable } from "rxjs";
import type { RpcConnectorConnectOptions } from "@/modules/owner/types/rpc-caller.type";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcConnectorState } from "@/modules/owner/types/rpc-owner-state.type";
import type { IRpcPeer } from "@/modules/peer";

export interface IRpcConnector {
	readonly state: RpcConnectorState;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeer;
	connect(options: RpcConnectorConnectOptions): Promise<void>;
	shutdown(): Promise<void>;
	close(): Promise<void>;
}
