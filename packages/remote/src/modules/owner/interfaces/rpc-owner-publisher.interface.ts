/**
 * @overview Role-specific RPC Topology Owner publication contracts.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import type { Observable } from "rxjs";
import type {
	RpcAcceptorState,
	RpcConnectorState,
} from "@/modules/owner/types/rpc-caller.type";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type {
	RpcAcceptorCommit,
	RpcConnectorCommit,
} from "@/modules/owner/types/rpc-owner-publication.type";
import type {
	IRpcPeer,
	IRpcPeerHost,
	RpcCallEventSink,
	RpcPeerState,
	RpcPeerStateView,
} from "@/modules/peer";
import type { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

export interface IRpcConnectorPublisher {
	readonly state: RpcConnectorState;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly callEventSink: RpcCallEventSink;
	registerPeer(
		initialState: RpcPeerState,
		build: (stateView: RpcPeerStateView) => IRpcPeerHost,
	): IRpcPeerHost;
	/** Evaluates the decision at the queue head, using the latest committed state. */
	enqueue(decide: () => RpcConnectorCommit | undefined): void;
	/** Publishes final state, completes streams, emits topology closure, then settles. */
	finish(
		state: Extract<
			RpcConnectorState,
			{ readonly status: RpcStateStatusEnum.closed }
		>,
		settle: () => void,
	): void;
}

export interface IRpcAcceptorPublisher {
	/** Whether a decision, commit, notification wave, or continuation is running. */
	readonly processing: boolean;
	readonly state: RpcAcceptorState;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;
	readonly callEventSink: RpcCallEventSink;
	registerPeer(
		initialState: RpcPeerState,
		build: (stateView: RpcPeerStateView) => IRpcPeerHost,
	): IRpcPeerHost;
	/** Evaluates the decision at the queue head, using the latest committed state. */
	enqueue(decide: () => RpcAcceptorCommit | undefined): void;
	/** Publishes final state, completes streams, emits topology closure, then settles. */
	finish(
		state: Extract<
			RpcAcceptorState,
			{ readonly status: RpcStateStatusEnum.closed }
		>,
		settle: () => void,
	): void;
}
