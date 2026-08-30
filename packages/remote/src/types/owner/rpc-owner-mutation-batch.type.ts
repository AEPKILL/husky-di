/**
 * @overview Private Topology Owner mutation-batch data contracts.
 * @author AEPKILL
 * @created 2026-08-30 14:43:57
 */

import type { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";

export type CreateRpcOwnerMutationBatchOptions<TOwnerState> = Readonly<{
	readonly initialState: TOwnerState;
	readonly initialMembership?: readonly IRpcPeerRuntime[];
}>;

export type RpcOwnerPeerMutation = Readonly<{
	readonly peer: IRpcPeerRuntime;
	readonly state: RpcPeerState;
	readonly terminal?: boolean;
}>;

export type RpcOwnerMutation<TOwnerState> = Readonly<{
	readonly ownerState?: TOwnerState;
	readonly membership?: readonly IRpcPeerRuntime[];
	readonly peerMutations?: readonly RpcOwnerPeerMutation[];
	/** Runs SPI-required terminal effects while public snapshots remain unchanged. */
	readonly beforeSnapshotCommit?: () => void;
	/** Commits role-specific Session ownership facts inside the notification barrier. */
	readonly commitFacts?: () => void;
	/** Runs effects that require the committed snapshots to be synchronously readable. */
	readonly afterSnapshotCommit?: () => void;
	readonly events?: readonly RpcEvent[];
	/** Queues work after this wave and mutations requested by its observers. */
	readonly afterNotifications?: () => void;
}>;

export type FinishRpcOwnerMutationBatchOptions<TOwnerState> = Readonly<{
	readonly ownerState: TOwnerState;
	readonly event: Extract<
		RpcEvent,
		{ readonly type: RpcEventTypeEnum.topologyClosed }
	>;
	/** Settles the public termination task after every stream has completed. */
	readonly afterCompletion?: () => void;
}>;
