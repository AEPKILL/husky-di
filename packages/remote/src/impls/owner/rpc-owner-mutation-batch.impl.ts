/**
 * @overview Atomic RPC Topology Owner snapshot commit and ordered notification implementation.
 * @author AEPKILL
 * @created 2026-08-30 14:43:57
 */

import { type Observable, ReplaySubject, Subject } from "rxjs";
import type { IRpcOwnerMutationBatch } from "@/interfaces/owner/rpc-owner-mutation-batch.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type {
	CreateRpcOwnerMutationBatchOptions,
	FinishRpcOwnerMutationBatchOptions,
	RpcOwnerMutation,
} from "@/types/owner/rpc-owner-mutation-batch.type";
import type { RpcPeerCallEvent } from "@/types/peer/rpc-peer-call-event.type";

/** Commits one Owner mutation before publishing its ordered observations. */
export class RpcOwnerMutationBatchImpl<TOwnerState>
	implements IRpcOwnerMutationBatch<TOwnerState>
{
	readonly #stateSubject = new ReplaySubject<TOwnerState>(1);
	readonly #membershipSubject = new ReplaySubject<readonly IRpcPeer[]>(1);
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #pendingOperations: Array<() => void> = [];
	#state: TOwnerState;
	#membership: readonly IRpcPeerRuntime[];
	#capturedCallEvents: RpcPeerCallEvent[] | undefined;
	#processing = false;
	#finished = false;
	readonly state$: Observable<TOwnerState>;
	readonly membership$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	constructor(options: CreateRpcOwnerMutationBatchOptions<TOwnerState>) {
		this.#state = Object.freeze(options.initialState);
		this.#membership = Object.freeze([...(options.initialMembership ?? [])]);
		this.#stateSubject.next(this.#state);
		this.#membershipSubject.next(this.#membership);
		this.state$ = this.#stateSubject.asObservable();
		this.membership$ = this.#membershipSubject.asObservable();
		this.event$ = this.#eventSubject.asObservable();
	}

	get state(): TOwnerState {
		return this.#state;
	}

	get busy(): boolean {
		return this.#processing;
	}

	get membership(): readonly IRpcPeerRuntime[] {
		return this.#membership;
	}

	mutate(
		createMutation: () => RpcOwnerMutation<TOwnerState> | undefined,
	): void {
		this.#enqueue(() => {
			if (this.#finished) {
				return;
			}
			const mutation = createMutation();
			if (mutation !== undefined) {
				this.#commitMutation(mutation);
			}
		});
	}

	emitCallEvent(event: RpcPeerCallEvent): void {
		if (this.#capturedCallEvents === undefined) {
			this.#eventSubject.next(event);
			return;
		}
		this.#capturedCallEvents.push(event);
	}

	finish(options: FinishRpcOwnerMutationBatchOptions<TOwnerState>): void {
		this.#enqueue(() => {
			if (this.#finished) {
				return;
			}
			this.#finished = true;
			this.#commitMutation({ ownerState: options.ownerState });
			this.#stateSubject.complete();
			this.#membershipSubject.complete();
			this.#eventSubject.next(options.event);
			this.#eventSubject.complete();
			options.afterCompletion?.();
		});
	}

	#commitMutation(mutation: RpcOwnerMutation<TOwnerState>): void {
		const committedState =
			mutation.ownerState === undefined
				? undefined
				: Object.freeze(mutation.ownerState);
		const committedMembership =
			mutation.membership === undefined
				? undefined
				: Object.freeze([...mutation.membership]);
		const peerMutations = mutation.peerMutations ?? [];
		const parentCapture = this.#capturedCallEvents;
		const capturedCallEvents: RpcPeerCallEvent[] = [];
		this.#capturedCallEvents = capturedCallEvents;

		try {
			mutation.beforeSnapshotCommit?.();
			mutation.commitFacts?.();
			if (committedState !== undefined) {
				this.#state = committedState;
			}
			if (committedMembership !== undefined) {
				this.#membership = committedMembership;
			}
			for (const peerMutation of peerMutations) {
				peerMutation.peer.stageState(peerMutation.state);
			}
			mutation.afterSnapshotCommit?.();
		} finally {
			this.#capturedCallEvents = parentCapture;
		}

		for (const event of capturedCallEvents) {
			this.#publishCallEvent(event);
		}
		if (committedState !== undefined) {
			this.#stateSubject.next(committedState);
		}
		if (committedMembership !== undefined) {
			this.#membershipSubject.next(committedMembership);
		}
		for (const peerMutation of peerMutations) {
			peerMutation.peer.flushState();
		}
		for (const event of mutation.events ?? []) {
			this.#eventSubject.next(event);
		}
		for (const peerMutation of peerMutations) {
			if (peerMutation.terminal === true) {
				peerMutation.peer.completeState();
			}
		}
		if (mutation.afterNotifications !== undefined) {
			this.#pendingOperations.push(mutation.afterNotifications);
		}
	}

	#enqueue(operation: () => void): void {
		this.#pendingOperations.push(operation);
		if (this.#processing) {
			return;
		}

		this.#processing = true;
		try {
			let next = this.#pendingOperations.shift();
			while (next !== undefined) {
				next();
				next = this.#pendingOperations.shift();
			}
		} finally {
			this.#processing = false;
		}
	}

	#publishCallEvent(event: RpcPeerCallEvent): void {
		if (this.#capturedCallEvents === undefined) {
			this.#eventSubject.next(event);
			return;
		}
		this.#capturedCallEvents.push(event);
	}
}
