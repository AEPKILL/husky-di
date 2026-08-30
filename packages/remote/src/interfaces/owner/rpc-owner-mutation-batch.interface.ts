/**
 * @overview Private atomic mutation and notification contract shared by RPC Topology Owners.
 * @author AEPKILL
 * @created 2026-08-30 14:43:57
 */

import type { Observable } from "rxjs";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type {
	FinishRpcOwnerMutationBatchOptions,
	RpcOwnerMutation,
} from "@/types/owner/rpc-owner-mutation-batch.type";
import type { RpcPeerCallEvent } from "@/types/peer/rpc-peer-call-event.type";

export interface IRpcOwnerMutationBatch<TOwnerState> {
	readonly busy: boolean;
	readonly state: TOwnerState;
	readonly state$: Observable<TOwnerState>;
	readonly membership: readonly IRpcPeerRuntime[];
	readonly membership$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;
	mutate(createMutation: () => RpcOwnerMutation<TOwnerState> | undefined): void;
	emitCallEvent(event: RpcPeerCallEvent): void;
	finish(options: FinishRpcOwnerMutationBatchOptions<TOwnerState>): void;
}
