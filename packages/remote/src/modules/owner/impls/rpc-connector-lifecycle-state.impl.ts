/**
 * @overview Atomic Connector and Peer lifecycle snapshots with synchronous state streams.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { map, Observable, Subject } from "rxjs";
import type { IRpcConnectorLifecycleState } from "@/modules/owner/interfaces/rpc-connector-lifecycle-state.interface";
import type { RpcConnectorState } from "@/modules/owner/types/rpc-owner-state.type";
import type { IRpcPeerStateView, RpcPeerState } from "@/modules/peer";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

export class RpcConnectorLifecycleStateImpl
	implements IRpcConnectorLifecycleState
{
	get state(): RpcConnectorState {
		return this._snapshot.state;
	}

	readonly state$: Observable<RpcConnectorState>;
	readonly peerStateView: IRpcPeerStateView;

	private _snapshot: RpcConnectorLifecycleSnapshot = {
		revision: BigInt(0),
		state: Object.freeze({ status: RpcStateStatusEnum.active }),
		peerState: Object.freeze({ status: RpcStateStatusEnum.unbound }),
	};
	private readonly _changes = new Subject<RpcConnectorLifecycleSnapshot>();
	private readonly _pending: RpcConnectorLifecycleSnapshot[] = [];
	private _publishing = false;

	constructor() {
		const snapshots = new Observable<RpcConnectorLifecycleSnapshot>(
			(subscriber) => {
				const initial = this._snapshot;
				let observedRevision = initial.revision;
				const subscription = this._changes.subscribe((snapshot) => {
					// A subscriber joining a reentrant wave already replayed the latest commit.
					if (snapshot.revision <= observedRevision) return;
					observedRevision = snapshot.revision;
					subscriber.next(snapshot);
				});
				subscriber.next(initial);
				return subscription;
			},
		);
		this.state$ = snapshots.pipe(map((snapshot) => snapshot.state));
		this.peerStateView = Object.freeze({
			readState: () => this._snapshot.peerState,
			state$: snapshots.pipe(map((snapshot) => snapshot.peerState)),
		});
	}

	commit(state: RpcConnectorState, peerState: RpcPeerState): void {
		this._snapshot = {
			revision: this._snapshot.revision + BigInt(1),
			state: Object.freeze({ ...state }),
			peerState: Object.freeze({ ...peerState }),
		};
		this._pending.push(this._snapshot);
		if (this._publishing) return;
		this._publishing = true;
		try {
			// Reentrant commits update live reads now and publish after this entire wave.
			for (const snapshot of this._pending) this._changes.next(snapshot);
		} finally {
			this._pending.length = 0;
			this._publishing = false;
		}
	}
}

type RpcConnectorLifecycleSnapshot = {
	readonly revision: bigint;
	readonly state: RpcConnectorState;
	readonly peerState: RpcPeerState;
};
