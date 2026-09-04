/**
 * @overview Role-specific RPC Topology Owner atomic publication implementations.
 * @author AEPKILL
 * @created 2026-09-04 12:00:00
 */

import { type Observable, ReplaySubject, Subject } from "rxjs";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "@/interfaces/owner/rpc-owner-publisher.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerHost,
	RpcPeerStateView,
} from "@/interfaces/peer/rpc-peer-host.interface";
import type {
	RpcAcceptorState,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type {
	RpcAcceptorCommit,
	RpcAcceptorPublication,
	RpcConnectorCommit,
	RpcConnectorPublication,
	RpcOwnerCommit,
	RpcOwnerContinuation,
	RpcPeerStatePublication,
} from "@/types/owner/rpc-owner-publication.type";
import type {
	RpcCallEventSink,
	RpcPeerCallEvent,
} from "@/types/peer/rpc-peer-call-event.type";

export type CreateRpcConnectorPublisherOptions = Readonly<{
	readonly initialState: RpcConnectorState;
}>;

export type CreateRpcAcceptorPublisherOptions = Readonly<{
	readonly initialState: RpcAcceptorState;
}>;

export { RpcAcceptorPublisherImpl, RpcConnectorPublisherImpl };

type RpcConnectorFinalState = Extract<
	RpcConnectorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcAcceptorFinalState = Extract<
	RpcAcceptorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcOwnerFinalState = RpcConnectorFinalState | RpcAcceptorFinalState;

type RpcTopologyClosedEvent = Extract<
	RpcEvent,
	{ readonly type: RpcEventTypeEnum.topologyClosed }
>;

type RpcPublisherPublication<TOwnerState> = Readonly<{
	readonly state?: TOwnerState;
	readonly peers?: readonly IRpcPeer[];
	readonly peerStates?: readonly RpcPeerStatePublication[];
	readonly events?: readonly RpcEvent[];
}>;

type RpcPreparedRolePublication = Readonly<{
	readonly install: () => void;
	readonly flush: () => void;
}>;

type RpcPeerPublicationRecord = {
	state: RpcPeerState;
	readonly stateSubject: ReplaySubject<RpcPeerState>;
	completed: boolean;
};

type RpcPreparedPeerPublication = Readonly<{
	readonly peer: IRpcPeer;
	readonly record: RpcPeerPublicationRecord;
	readonly state: RpcPeerState;
	readonly terminal: boolean;
}>;

type RpcPreparedPublication<TOwnerState> = Readonly<{
	readonly state: TOwnerState | undefined;
	readonly role: RpcPreparedRolePublication | undefined;
	readonly peers: readonly IRpcPeer[] | undefined;
	readonly peerStates: readonly RpcPreparedPeerPublication[];
	readonly events: readonly RpcEvent[];
}>;

abstract class RpcOwnerPublisherImpl<
	TOwnerState,
	TFinalState extends TOwnerState & RpcOwnerFinalState,
	TPublication extends RpcPublisherPublication<TOwnerState>,
	TCommit extends RpcOwnerCommit<TPublication>,
> {
	readonly #stateSubject = new ReplaySubject<TOwnerState>(1);
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #peerRecords = new WeakMap<IRpcPeer, RpcPeerPublicationRecord>();
	readonly #pendingOperations: Array<() => void> = [];
	#state: TOwnerState;
	#capturedCallEvents: RpcPeerCallEvent[] | undefined;
	#processing = false;
	#finished = false;
	readonly state$: Observable<TOwnerState>;
	readonly event$: Observable<RpcEvent>;
	readonly callEventSink: RpcCallEventSink = (event) => {
		const snapshot = snapshotRecord(event, "RPC call event");
		if (this.#capturedCallEvents === undefined) {
			this.#eventSubject.next(snapshot);
			return;
		}
		this.#capturedCallEvents.push(snapshot);
	};

	protected constructor(initialState: TOwnerState) {
		this.#state = Object.freeze(initialState);
		this.#stateSubject.next(this.#state);
		this.state$ = this.#stateSubject.asObservable();
		this.event$ = this.#eventSubject.asObservable();
	}

	get state(): TOwnerState {
		return this.#state;
	}

	registerPeer(
		initialState: RpcPeerState,
		build: (stateView: RpcPeerStateView) => IRpcPeerHost,
	): IRpcPeerHost {
		if (this.#finished) {
			throw new Error("Cannot register an RPC Peer with a finished Publisher.");
		}
		const stateSubject = new ReplaySubject<RpcPeerState>(1);
		const record: RpcPeerPublicationRecord = {
			state: Object.freeze(initialState),
			stateSubject,
			completed: false,
		};
		const stateView = Object.freeze<RpcPeerStateView>({
			readState: () => record.state,
			state$: stateSubject.asObservable(),
		});
		stateSubject.next(record.state);

		try {
			const host = build(stateView);
			if (this.#peerRecords.has(host.peer)) {
				throw new Error("RPC Peer is already registered with this Publisher.");
			}
			this.#peerRecords.set(host.peer, record);
			return host;
		} catch (error) {
			stateSubject.complete();
			throw error;
		}
	}

	enqueue(decide: () => TCommit | undefined): void {
		this.#enqueue(() => {
			if (this.#finished) {
				return;
			}
			const commit = decide();
			if (commit !== undefined) {
				this.#applyCommit(commit);
			}
		});
	}

	finish(state: TFinalState, settle: () => void): void {
		this.#enqueue(() => {
			if (this.#finished) {
				return;
			}
			this.#finished = true;
			Object.freeze(state);
			this.#state = state;
			this.#stateSubject.next(state);
			this.#stateSubject.complete();
			this.completeRole();
			this.#eventSubject.next(createTopologyClosedEvent(state));
			this.#eventSubject.complete();
			settle();
		});
	}

	protected isProcessing(): boolean {
		return this.#processing;
	}

	protected prepareRolePublication(
		_peers: readonly IRpcPeer[] | undefined,
	): RpcPreparedRolePublication | undefined {
		return undefined;
	}

	protected completeRole(): void {}

	#applyCommit(commit: TCommit): void {
		const prepared = this.#preparePublication(commit.publication);
		const apply = commit.apply;
		const parentCapture = this.#capturedCallEvents;
		const callEvents: RpcPeerCallEvent[] = [];
		this.#capturedCallEvents = callEvents;
		let scopeOpen = true;
		let snapshotsCommitted = false;
		let stickyFailure: Error | undefined;
		let applyFailure: unknown;
		let applyFailed = false;
		let continuation: RpcOwnerContinuation | undefined;
		const commitSnapshots = (): void => {
			if (!scopeOpen) {
				throw new Error("RPC snapshot commit scope has ended.");
			}
			if (snapshotsCommitted) {
				stickyFailure ??= new Error(
					"RPC snapshots were committed more than once.",
				);
				throw stickyFailure;
			}
			this.#installSnapshots(prepared);
			snapshotsCommitted = true;
		};

		try {
			try {
				if (apply === undefined) {
					commitSnapshots();
				} else {
					continuation = apply(commitSnapshots);
				}
			} catch (error) {
				applyFailed = true;
				applyFailure = error;
			}
			if (apply !== undefined && !snapshotsCommitted && !applyFailed) {
				applyFailed = true;
				applyFailure = new Error(
					"RPC commit apply returned without committing snapshots.",
				);
			}
		} finally {
			scopeOpen = false;
			this.#capturedCallEvents = parentCapture;
		}

		if (snapshotsCommitted) {
			this.#flushPublication(prepared, callEvents);
		}
		if (stickyFailure !== undefined) {
			throw stickyFailure;
		}
		if (applyFailed) {
			throw applyFailure;
		}
		if (continuation !== undefined) {
			this.#pendingOperations.push(continuation);
		}
	}

	#preparePublication(
		publication: TPublication,
	): RpcPreparedPublication<TOwnerState> {
		const state =
			publication.state === undefined
				? undefined
				: snapshotOwnerState(publication.state);
		const peers =
			publication.peers === undefined
				? undefined
				: Object.freeze([...publication.peers]);
		const peerStates = this.#preparePeerStates(publication.peerStates ?? []);
		const events = Object.freeze(
			(publication.events ?? []).map((event) =>
				snapshotRecord(event, "RPC event"),
			),
		);
		this.#validateMembership(peers, peerStates);
		return {
			state,
			role: this.prepareRolePublication(peers),
			peers,
			peerStates,
			events,
		};
	}

	#installSnapshots(prepared: RpcPreparedPublication<TOwnerState>): void {
		if (prepared.state !== undefined) {
			this.#state = prepared.state;
		}
		prepared.role?.install();
		for (const peerState of prepared.peerStates) {
			peerState.record.state = peerState.state;
			peerState.record.completed = peerState.terminal;
		}
	}

	#flushPublication(
		prepared: RpcPreparedPublication<TOwnerState>,
		callEvents: readonly RpcPeerCallEvent[],
	): void {
		for (const event of callEvents) {
			this.#publishCallEvent(event);
		}
		if (prepared.state !== undefined) {
			this.#stateSubject.next(prepared.state);
		}
		prepared.role?.flush();
		for (const peerState of prepared.peerStates) {
			peerState.record.stateSubject.next(peerState.state);
		}
		for (const event of prepared.events) {
			this.#eventSubject.next(event);
		}
		for (const peerState of prepared.peerStates) {
			if (peerState.terminal) {
				peerState.record.stateSubject.complete();
			}
		}
	}

	#preparePeerStates(
		publications: readonly RpcPeerStatePublication[],
	): readonly RpcPreparedPeerPublication[] {
		const peers = new Set<IRpcPeer>();
		return Object.freeze(
			publications.map((publication) => {
				if (peers.has(publication.peer)) {
					throw new Error(
						"RPC Peer appears more than once in one publication.",
					);
				}
				peers.add(publication.peer);
				const record = this.#requireActivePeer(publication.peer);
				if (
					publication.terminal !== undefined &&
					typeof publication.terminal !== "boolean"
				) {
					throw new TypeError("RPC Peer terminal marker must be boolean.");
				}
				const state = snapshotRecord(publication.state, "RPC Peer state");
				const terminal = publication.terminal === true;
				if (terminal !== (state.status === RpcStateStatusEnum.closed)) {
					throw new Error(
						"RPC Peer terminal marker must match its closed state.",
					);
				}
				return Object.freeze({
					peer: publication.peer,
					record,
					state,
					terminal,
				});
			}),
		);
	}

	#validateMembership(
		peers: readonly IRpcPeer[] | undefined,
		peerStates: readonly RpcPreparedPeerPublication[],
	): void {
		if (peers === undefined) {
			return;
		}
		const members = new Set<IRpcPeer>();
		const terminalPeers = new Set(
			peerStates.filter(({ terminal }) => terminal).map(({ peer }) => peer),
		);
		for (const peer of peers) {
			if (members.has(peer)) {
				throw new Error("RPC Peer appears more than once in membership.");
			}
			members.add(peer);
			this.#requireActivePeer(peer);
			if (terminalPeers.has(peer)) {
				throw new Error("Terminal RPC Peer cannot remain in membership.");
			}
		}
	}

	#requireActivePeer(peer: IRpcPeer): RpcPeerPublicationRecord {
		const record = this.#peerRecords.get(peer);
		if (record === undefined) {
			throw new Error("RPC Peer is not registered with this Publisher.");
		}
		if (record.completed) {
			throw new Error("RPC Peer publication is already complete.");
		}
		return record;
	}

	#enqueue(operation: () => void): void {
		this.#pendingOperations.push(operation);
		if (this.#processing) {
			return;
		}

		this.#processing = true;
		let firstFailure: unknown;
		let failed = false;
		try {
			let next = this.#pendingOperations.shift();
			while (next !== undefined) {
				try {
					next();
				} catch (error) {
					if (!failed) {
						failed = true;
						firstFailure = error;
					}
				}
				next = this.#pendingOperations.shift();
			}
		} finally {
			this.#processing = false;
		}
		if (failed) {
			throw firstFailure;
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

/** Publishes Connector snapshots and events without allocating a membership channel. */
class RpcConnectorPublisherImpl
	extends RpcOwnerPublisherImpl<
		RpcConnectorState,
		RpcConnectorFinalState,
		RpcConnectorPublication,
		RpcConnectorCommit
	>
	implements IRpcConnectorPublisher
{
	constructor(options: CreateRpcConnectorPublisherOptions) {
		super(options.initialState);
	}

	protected override prepareRolePublication(
		peers: readonly IRpcPeer[] | undefined,
	): undefined {
		if (peers !== undefined) {
			throw new Error("Connector publication cannot include Peer membership.");
		}
	}
}

/** Publishes Acceptor snapshots, membership, and events as one ordered wave. */
class RpcAcceptorPublisherImpl
	extends RpcOwnerPublisherImpl<
		RpcAcceptorState,
		RpcAcceptorFinalState,
		RpcAcceptorPublication,
		RpcAcceptorCommit
	>
	implements IRpcAcceptorPublisher
{
	readonly #peersSubject = new ReplaySubject<readonly IRpcPeer[]>(1);
	#peers: readonly IRpcPeer[];
	readonly peers$: Observable<readonly IRpcPeer[]>;

	constructor(options: CreateRpcAcceptorPublisherOptions) {
		super(options.initialState);
		this.#peers = Object.freeze([]);
		this.#peersSubject.next(this.#peers);
		this.peers$ = this.#peersSubject.asObservable();
	}

	get processing(): boolean {
		return this.isProcessing();
	}

	get peers(): readonly IRpcPeer[] {
		return this.#peers;
	}

	protected override prepareRolePublication(
		peers: readonly IRpcPeer[] | undefined,
	): RpcPreparedRolePublication | undefined {
		if (peers === undefined) {
			return undefined;
		}
		return {
			install: () => {
				this.#peers = peers;
			},
			flush: () => this.#peersSubject.next(peers),
		};
	}

	protected override completeRole(): void {
		this.#peersSubject.complete();
	}
}

function snapshotOwnerState<T>(state: T): T {
	const snapshot = snapshotRecord(state, "RPC Owner state") as T & {
		readonly listener?: unknown;
	};
	if (snapshot.listener === undefined) {
		return snapshot;
	}
	return Object.freeze({
		...snapshot,
		listener: snapshotRecord(snapshot.listener, "RPC Acceptor listener state"),
	}) as T;
}

function snapshotRecord<T>(value: T, label: string): T {
	if (typeof value !== "object" || value === null) {
		throw new TypeError(`${label} must be an object.`);
	}
	return Object.freeze({ ...value }) as T;
}

function createTopologyClosedEvent(
	state: RpcOwnerFinalState,
): RpcTopologyClosedEvent {
	if (state.outcome === RpcCloseOutcomeEnum.normal) {
		return {
			type: RpcEventTypeEnum.topologyClosed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: state.reason,
		};
	}
	return {
		type: RpcEventTypeEnum.topologyClosed,
		outcome: RpcCloseOutcomeEnum.failed,
		reason: state.reason,
	};
}
