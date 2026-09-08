/**
 * @overview Owner's stable Connector Peer and provisional Session lifecycle attachment contracts.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { IRpcConnectorLifecycleState } from "@/modules/owner/interfaces/rpc-connector-lifecycle-state.interface";
import type { RpcOwnerCloseReason } from "@/modules/owner/types/rpc-owner-close-reason.type";
import type {
	IRpcPeer,
	RpcPeerFactory,
	RpcSessionClosedState,
} from "@/modules/peer";
import type {
	IRpcProtocolSessionLifecycle,
	IRpcProtocolSessionLifecycleHost,
	RpcProtocolFaultReason,
} from "@/modules/protocol";

export type RpcConnectorSessionLifecycleFactory = (options: {
	readonly state: IRpcConnectorLifecycleState;
	readonly createPeer: RpcPeerFactory;
	readonly owner: IRpcConnectorSessionLifecycleOwner;
}) => IRpcConnectorSessionLifecycle;

/** Synchronous Owner effects and exact failed-attempt state restoration. */
export interface IRpcConnectorSessionLifecycleOwner {
	/** Revokes attempts and Connector-wide Protocol activity and starts Direct Close.
	 * The lifecycle owns forceClose of its exact retained Session. The Owner tracks
	 * asynchronous cleanup separately and must not publish closed before it settles.
	 * This effect must not publish the lifecycle's terminal snapshots.
	 */
	beginClosing(state: RpcSessionClosedState, forced: boolean): void;
	/** Fails only the attempt owning this provisional attachment, restoring its eligible state. */
	failAttachment(
		attachment: IRpcConnectorSessionLifecycleAttachment,
		error: Error,
	): void;
}

/** Lifecycle ownership only; an attached Session is not necessarily active or callable. */
export interface IRpcConnectorSessionLifecycle {
	readonly peer: IRpcPeer;
	readonly attached: boolean;
	attach(
		session: IRpcProtocolSessionLifecycle,
	): IRpcConnectorSessionLifecycleAttachment | undefined;
	/** Commits the Owner drain cutoff and immediately forces recovering Sessions. */
	beginGracefulShutdown(): void;
	/** Applies the Owner's selected reason; forced controls whether retained work is aborted. */
	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void;
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void;
}

/** Authority over one provisional attachment, never a transferable call capability. */
export interface IRpcConnectorSessionLifecycleAttachment {
	readonly host: IRpcProtocolSessionLifecycleHost;
	readonly active: boolean;
	/** Rechecks the current attempt at commit; true records the commit, not continued liveness. */
	activate(canActivate: () => boolean): boolean;
	/** Idempotently discards only this still-provisional attachment. */
	discard(): void;
}
