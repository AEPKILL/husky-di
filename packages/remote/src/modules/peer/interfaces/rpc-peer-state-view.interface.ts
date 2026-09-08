/**
 * @overview Live readonly Owner state dependency retained by one stable RPC Peer.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { Observable } from "rxjs";
import type { RpcPeerState } from "@/modules/peer/types/rpc-peer-state.type";

export interface IRpcPeerStateView {
	readonly readState: () => RpcPeerState;
	readonly state$: Observable<RpcPeerState>;
}
