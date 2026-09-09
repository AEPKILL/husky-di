/**
 * @overview Labels the actual Peer state separately from reconnection attempts.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { type RpcPeerState, RpcStateStatusEnum } from "@husky-di/remote";

export function getPeerStatusLabel(status: RpcPeerState["status"]): string {
	return {
		[RpcStateStatusEnum.unbound]: "Not connected",
		[RpcStateStatusEnum.connecting]: "Connecting",
		[RpcStateStatusEnum.connected]: "Live transport",
		[RpcStateStatusEnum.recovering]: "Transport disconnected",
		[RpcStateStatusEnum.draining]: "Disconnecting",
		[RpcStateStatusEnum.closed]: "Connection closed",
	}[status];
}
