/**
 * @overview Owner-owned Connector and Peer lifecycle snapshot commit boundary.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type { Observable } from "rxjs";
import type { RpcConnectorState } from "@/modules/owner/types/rpc-owner-state.type";
import type { IRpcPeerStateView, RpcPeerState } from "@/modules/peer";

export interface IRpcConnectorLifecycleState {
	readonly state: RpcConnectorState;
	readonly state$: Observable<RpcConnectorState>;
	readonly peerStateView: IRpcPeerStateView;
	/** Commits both authoritative snapshots before publishing either state stream. */
	commit(state: RpcConnectorState, peerState: RpcPeerState): void;
}
