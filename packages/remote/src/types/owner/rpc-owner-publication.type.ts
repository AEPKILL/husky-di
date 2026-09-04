/**
 * @overview Role-specific RPC Topology Owner atomic publications and scoped commits.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	RpcAcceptorState,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";

export type RpcPeerStatePublication = Readonly<{
	readonly peer: IRpcPeer;
	readonly state: RpcPeerState;
	readonly terminal?: boolean;
}>;

export type RpcConnectorPublication = Readonly<{
	readonly state?: RpcConnectorState;
	readonly peerStates?: readonly RpcPeerStatePublication[];
	readonly events?: readonly RpcEvent[];
}>;

export type RpcAcceptorPublication = Readonly<{
	readonly state?: RpcAcceptorState;
	readonly peers?: readonly IRpcPeer[];
	readonly peerStates?: readonly RpcPeerStatePublication[];
	readonly events?: readonly RpcEvent[];
}>;

export type RpcOwnerContinuation = () => void;

export type RpcOwnerCommit<TPublication> = Readonly<{
	readonly publication: TPublication;
	readonly apply?: (
		commitSnapshots: () => void,
	) => RpcOwnerContinuation | undefined;
}>;

export type RpcConnectorCommit = RpcOwnerCommit<RpcConnectorPublication>;

export type RpcAcceptorCommit = RpcOwnerCommit<RpcAcceptorPublication>;
