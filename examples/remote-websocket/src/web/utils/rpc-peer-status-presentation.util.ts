/**
 * @overview Maps public RPC peer states to observatory badge presentation.
 * @author AEPKILL
 * @created 2026-08-21 00:26:50
 */

import { type RpcPeerState, RpcStateStatusEnum } from "@husky-di/remote";

export function getRpcPeerStatusPresentation(status: RpcPeerState["status"]): {
	readonly label: string;
	readonly variant: "default" | "muted" | "warning" | "danger";
} {
	switch (status) {
		case RpcStateStatusEnum.unbound:
			return { label: "Not connected", variant: "muted" };
		case RpcStateStatusEnum.connecting:
			return { label: "Connecting", variant: "warning" };
		case RpcStateStatusEnum.connected:
			return { label: "Live transport", variant: "default" };
		case RpcStateStatusEnum.recovering:
			return { label: "Transport disconnected", variant: "danger" };
		case RpcStateStatusEnum.draining:
			return { label: "Disconnecting", variant: "warning" };
		case RpcStateStatusEnum.closed:
			return { label: "Connection closed", variant: "danger" };
	}
}
