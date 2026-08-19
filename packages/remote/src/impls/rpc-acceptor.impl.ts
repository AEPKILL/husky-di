/**
 * @overview Acceptor Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { Observable, Subject, type Subscription } from "rxjs";

import { createRpcError } from "@/exceptions/rpc-error.exception";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import {
	type RpcPeerCommittedInvocation,
	RpcPeerImpl,
	type RpcPeerInvocationReservation,
} from "@/impls/rpc-peer.impl";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/rpc-adapter.interface";
import type {
	IRpcAcceptor,
	IRpcPeer,
	RemoteServiceGroup,
	RpcEvent,
	RpcPeerResult,
} from "@/interfaces/rpc-caller.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type {
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/rpc-protocol.interface";
import type {
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/remote-service-descriptor.type";
import type {
	RpcAcceptorListenerState,
	RpcAcceptorState,
} from "@/types/rpc-caller.type";
import { normalizeRpcApplicationArguments } from "@/utils/rpc-application-value.util";
import {
	installRpcAbortListener,
	prepareRpcInvocationArguments,
} from "@/utils/rpc-cancellation.util";
import {
	installRpcExposure,
	type RpcExposureRegistry,
} from "@/utils/rpc-exposure.util";
import { createRpcFacade } from "@/utils/rpc-facade.util";
import { RpcHandlerScheduler } from "@/utils/rpc-handler-scheduler.util";

interface RpcAcceptorListenerAttempt {
	readonly abortController: AbortController;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	readonly listenerCleanup: RpcAcceptorOwnedCleanup;
	readonly startupCleanup: RpcAcceptorOwnedCleanup;
	subscription?: Subscription;
	ready: boolean;
	terminal: boolean;
	cleanupRequested: boolean;
	cleanupBarrier?: Promise<void>;
}

interface RpcAcceptorOwnedCleanup {
	readonly cleanup: () => unknown;
	task?: Promise<void>;
	error?: Error;
}

type RpcAcceptorClosedState = Extract<
	RpcAcceptorState,
	{ readonly status: "closed" }
>;

/** Owns Acceptor listener state and its current stable peer membership. */
export class RpcAcceptorImpl implements IRpcAcceptor {
	readonly #runtime: IRpcProtocolAcceptorRuntime;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #ownerExposureRegistry: RpcExposureRegistry = new Map();
	readonly #stateSubject = new Subject<RpcAcceptorState>();
	readonly #peersSubject = new Subject<readonly IRpcPeer[]>();
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #sessions = new Map<IRpcProtocolSession, RpcPeerImpl>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #handlerScheduler: RpcHandlerScheduler;
	readonly #ownedConnections: IRpcConnection[] = [];
	readonly #connectionCloseTasks = new WeakMap<IRpcConnection, Promise<void>>();
	readonly #connectionCleanupEntries = new WeakMap<
		IRpcConnection,
		RpcAcceptorOwnedCleanup
	>();
	readonly #connectionTerminalSubscriptions = new Map<
		IRpcConnection,
		Subscription
	>();
	readonly #cleanupLedger: RpcAcceptorOwnedCleanup[] = [];
	readonly #ordinaryConnectionLimit: number;
	#state: RpcAcceptorState;
	#peers: readonly IRpcPeer[];
	#overflowConnection: IRpcConnection | undefined;
	#listenerCleanupBarrier: Promise<void> | undefined;
	#listenerAttempt: RpcAcceptorListenerAttempt | undefined;
	#insideConnectionHandoff = false;
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;
	#rejectTermination: ((error: unknown) => void) | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	#cleanupTimer: ReturnType<typeof setTimeout> | undefined;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	constructor(
		runtime: IRpcProtocolAcceptorRuntime,
		policy: IRpcProtocolRuntimePolicy,
	) {
		this.#runtime = runtime;
		this.#policy = policy;
		this.#handlerScheduler = new RpcHandlerScheduler(
			policy.maxHandlersTotal,
			policy.maxHandlersPerSession,
		);
		this.#ordinaryConnectionLimit =
			policy.maxSessions + 2 * policy.maxHandshakes;
		const listener = Object.freeze({ status: "idle" as const });
		this.#state = Object.freeze<RpcAcceptorState>({
			status: "active",
			listener,
		});
		this.#peers = Object.freeze<readonly IRpcPeer[]>([]);
		this.state$ = new Observable((subscriber) => {
			const subscription = this.#stateSubject.subscribe(subscriber);
			if (!subscriber.closed) {
				subscriber.next(this.#state);
			}
			return subscription;
		});
		this.peers$ = new Observable((subscriber) => {
			const subscription = this.#peersSubject.subscribe(subscriber);
			if (!subscriber.closed) {
				subscriber.next(this.#peers);
			}
			return subscription;
		});
		this.event$ = this.#eventSubject.asObservable();
	}

	get state(): RpcAcceptorState {
		return this.#state;
	}

	get peers(): readonly IRpcPeer[] {
		return this.#peers;
	}

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		if (this.state.status !== "active") {
			throw createRpcError("unavailable");
		}
		return installRpcExposure(
			descriptor,
			implementation,
			this.#ownerExposureRegistry,
			this.#peers
				.filter((peer): peer is RpcPeerImpl => peer instanceof RpcPeerImpl)
				.map((peer) => peer.localExposureRegistry),
		);
	}

	listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		try {
			return this.#listen(adapter);
		} catch (error) {
			return Promise.reject(error);
		}
	}

	#listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		if (
			this.state.status !== "active" ||
			(this.state.listener.status !== "idle" &&
				this.state.listener.status !== "stopped") ||
			this.#listenerAttempt !== undefined ||
			this.#listenerCleanupBarrier !== undefined ||
			this.#overflowConnection !== undefined
		) {
			return Promise.reject(createRpcError("unavailable"));
		}
		if (typeof adapter !== "object" || adapter === null) {
			return Promise.reject(new TypeError("adapter must be an object."));
		}
		const connectionSource = Reflect.get(adapter, "connection$") as
			| Observable<IRpcConnection>
			| undefined;
		const listen = Reflect.get(adapter, "listen");
		if (
			connectionSource === undefined ||
			typeof Reflect.get(connectionSource, "subscribe") !== "function" ||
			typeof listen !== "function"
		) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}

		let resolveStartup!: () => void;
		let rejectStartup!: (error: unknown) => void;
		const startup = new Promise<void>((resolve, reject) => {
			resolveStartup = resolve;
			rejectStartup = reject;
		});
		let attempt!: RpcAcceptorListenerAttempt;
		const listenerCleanup = this.#admitOwnedCleanup(() =>
			attempt.subscription?.unsubscribe(),
		);
		const startupCleanup = this.#admitOwnedCleanup(() =>
			startup.then(
				() => undefined,
				() => undefined,
			),
		);
		attempt = {
			abortController: new AbortController(),
			resolve: resolveStartup,
			reject: rejectStartup,
			listenerCleanup,
			startupCleanup,
			ready: false,
			terminal: false,
			cleanupRequested: false,
		};
		this.#listenerAttempt = attempt;
		this.#commitListener({ status: "starting" });

		try {
			attempt.subscription = connectionSource.subscribe({
				next: (connection) => this.#acceptConnection(connection),
				error: (error) => this.#terminalListener(attempt, "error", error),
				complete: () => this.#terminalListener(attempt, "complete"),
			});
		} catch (error) {
			this.#terminalListener(attempt, "error", error);
			return startup;
		}

		let readiness: Promise<unknown>;
		try {
			readiness = Promise.resolve(
				Reflect.apply(listen, adapter, [attempt.abortController.signal]),
			);
		} catch (error) {
			readiness = Promise.reject(error);
		}
		readiness.then(
			() => {
				if (attempt.terminal || this.#listenerAttempt !== attempt) {
					return;
				}
				attempt.ready = true;
				this.#commitListener({ status: "listening" });
				attempt.resolve();
			},
			(error) => {
				if (
					attempt.cleanupRequested &&
					!(error instanceof DOMException && error.name === "AbortError")
				) {
					this.#recordOwnedCleanupFailure(attempt.startupCleanup, error);
				}
				this.#terminalListener(attempt, "error", error);
			},
		);

		return startup;
	}

	#commitListener(listener: RpcAcceptorListenerState): void {
		if (this.state.status !== "active") {
			return;
		}
		this.#commitState(
			Object.freeze<RpcAcceptorState>({
				status: "active" as const,
				listener: Object.freeze(listener),
			}),
		);
	}

	#commitState(state: RpcAcceptorState): void {
		this.#stageState(state);
		this.#flushState();
	}

	#stageState(state: RpcAcceptorState): void {
		this.#state = Object.freeze(state);
	}

	#flushState(): void {
		this.#stateSubject.next(this.#state);
	}

	#commitPeers(peers: readonly IRpcPeer[]): void {
		this.#stagePeers(peers);
		this.#flushPeers();
	}

	#stagePeers(peers: readonly IRpcPeer[]): void {
		this.#peers = Object.freeze(peers);
	}

	#flushPeers(): void {
		this.#peersSubject.next(this.#peers);
	}

	#terminalListener(
		attempt: RpcAcceptorListenerAttempt,
		kind: "complete" | "error",
		value?: unknown,
	): void {
		if (attempt.terminal || this.#listenerAttempt !== attempt) {
			return;
		}
		attempt.terminal = true;
		this.#startListenerAttemptCleanup(attempt);
		this.#listenerAttempt = undefined;
		if (kind === "complete") {
			this.#commitListener({
				status: "stopped",
				outcome: "normal",
				reason: "completed",
			});
			if (!attempt.ready) {
				attempt.abortController.abort();
				attempt.reject(createRpcError("unavailable"));
			}
		} else {
			const error =
				value instanceof Error ? value : new Error("Adapter listener failed.");
			this.#commitListener({ status: "stopped", outcome: "failed", error });
			if (!attempt.ready) {
				attempt.abortController.abort();
				attempt.reject(createRpcError("unavailable", error));
			}
		}
	}

	#acceptConnection(connection: IRpcConnection): void {
		if (
			this.state.status !== "active" ||
			this.#listenerAttempt === undefined ||
			this.#listenerAttempt.terminal
		) {
			queueMicrotask(() => this.#directClose(connection));
			return;
		}
		const ordinaryConnectionCount =
			this.#ownedConnections.length -
			(this.#overflowConnection === undefined ? 0 : 1);
		if (ordinaryConnectionCount >= this.#ordinaryConnectionLimit) {
			this.#acceptOverflowConnection(connection);
			return;
		}
		this.#ownConnection(connection);
		this.#insideConnectionHandoff = true;
		let acceptance: Promise<unknown>;
		try {
			acceptance = Promise.resolve(
				this.#runtime.accept(
					connection,
					this.#listenerAttempt?.abortController.signal ??
						new AbortController().signal,
				),
			);
		} catch (error) {
			acceptance = Promise.reject(error);
		} finally {
			this.#insideConnectionHandoff = false;
		}
		void acceptance.catch(() => this.#directClose(connection));
	}

	#acceptOverflowConnection(connection: IRpcConnection): void {
		if (this.#overflowConnection !== undefined) {
			queueMicrotask(() => this.#directClose(connection));
			return;
		}
		this.#overflowConnection = connection;
		this.#ownConnection(connection);
		this.#stopListenerForResourcePressure();
		queueMicrotask(() => {
			const task = this.#directClose(connection);
			void task.then(
				() => this.#releaseOverflowConnection(connection),
				() => {},
			);
		});
	}

	#stopListenerForResourcePressure(): void {
		const attempt = this.#listenerAttempt;
		if (attempt === undefined) {
			return;
		}
		attempt.cleanupRequested = true;
		attempt.terminal = true;
		this.#listenerAttempt = undefined;
		this.#commitListener({
			status: "stopped",
			outcome: "normal",
			reason: "resource-pressure",
		});
		attempt.abortController.abort();
		if (!attempt.ready) {
			attempt.reject(
				new DOMException(
					"The listener stopped for resource pressure.",
					"AbortError",
				),
			);
		}
		this.#startListenerAttemptCleanup(attempt);
	}

	#releaseOverflowConnection(connection: IRpcConnection): void {
		if (this.#overflowConnection === connection) {
			this.#overflowConnection = undefined;
		}
	}

	#ownConnection(connection: IRpcConnection): void {
		if (
			this.#ownedConnections.includes(connection) ||
			this.#connectionCloseTasks.has(connection)
		) {
			return;
		}
		this.#ownedConnections.push(connection);
		const cleanup = this.#admitOwnedCleanup(() =>
			this.#directClose(connection),
		);
		this.#connectionCleanupEntries.set(connection, cleanup);
		const subscription = connection.message$.subscribe({
			error: () => this.#directClose(connection),
			complete: () => this.#directClose(connection),
		});
		this.#connectionTerminalSubscriptions.set(connection, subscription);
	}

	#directClose(connection: IRpcConnection): Promise<void> {
		const retained = this.#connectionCloseTasks.get(connection);
		if (retained !== undefined) {
			return retained;
		}
		this.#ownConnection(connection);

		let resolveClose!: () => void;
		let rejectClose!: (error: unknown) => void;
		const task = new Promise<void>((resolve, reject) => {
			resolveClose = resolve;
			rejectClose = reject;
		});
		this.#connectionCloseTasks.set(connection, task);
		const cleanup = this.#connectionCleanupEntries.get(connection);
		if (cleanup !== undefined) {
			this.#retainOwnedCleanup(cleanup, task);
		}
		try {
			Promise.resolve(connection.close()).then(resolveClose, rejectClose);
		} catch (error) {
			rejectClose(error);
		}
		void task.catch(() => {});
		void task.then(
			() => this.#releaseOwnedConnection(connection),
			() => {},
		);
		return task;
	}

	#admitOwnedCleanup(cleanup: () => unknown): RpcAcceptorOwnedCleanup {
		const entry: RpcAcceptorOwnedCleanup = { cleanup };
		this.#cleanupLedger.push(entry);
		return entry;
	}

	#startOwnedCleanup(entry: RpcAcceptorOwnedCleanup): Promise<void> {
		if (entry.task !== undefined) {
			return entry.task;
		}
		let cleanup: unknown;
		try {
			cleanup = entry.cleanup();
		} catch (error) {
			cleanup = Promise.reject(error);
		}
		return this.#retainOwnedCleanup(entry, cleanup);
	}

	#retainOwnedCleanup(
		entry: RpcAcceptorOwnedCleanup,
		cleanup: unknown,
	): Promise<void> {
		if (entry.task !== undefined) {
			return entry.task;
		}
		const task = Promise.resolve(cleanup).then(
			() => undefined,
			(error: unknown) => {
				this.#recordOwnedCleanupFailure(entry, error);
				throw entry.error;
			},
		);
		entry.task = task;
		void task.catch(() => {});
		void task.then(
			() => this.#releaseSettledOwnedCleanup(entry),
			() => {},
		);
		return task;
	}

	#releaseSettledOwnedCleanup(entry: RpcAcceptorOwnedCleanup): void {
		if (this.#terminationTask !== undefined || entry.error !== undefined) {
			return;
		}
		const index = this.#cleanupLedger.indexOf(entry);
		if (index >= 0) {
			this.#cleanupLedger.splice(index, 1);
		}
	}

	#recordOwnedCleanupFailure(
		entry: RpcAcceptorOwnedCleanup,
		value: unknown,
	): void {
		entry.error ??=
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
	}

	#releaseOwnedConnection(connection: IRpcConnection): void {
		const index = this.#ownedConnections.indexOf(connection);
		if (index >= 0) {
			this.#ownedConnections.splice(index, 1);
		}
		this.#connectionTerminalSubscriptions.get(connection)?.unsubscribe();
		this.#connectionTerminalSubscriptions.delete(connection);
	}

	resolveAll<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteServiceGroup<T, Definitions> {
		const service = getRemoteServiceDescriptorData(descriptor).wireName;
		return createRpcFacade(descriptor, (method, cancelable, actualArguments) =>
			this.#invokeGroup(service, method, cancelable, actualArguments),
		) as RemoteServiceGroup<T, Definitions>;
	}

	#invokeGroup(
		service: string,
		method: string,
		cancelable: boolean,
		actualArguments: readonly unknown[],
	): Promise<readonly RpcPeerResult<unknown>[]> {
		const prepared = prepareRpcInvocationArguments(cancelable, actualArguments);
		if (this.state.status !== "active") {
			return Promise.reject(createRpcError("unavailable"));
		}
		const args = normalizeRpcApplicationArguments(
			prepared.applicationArguments,
		);
		const peers = this.#peers.filter(
			(peer): peer is RpcPeerImpl =>
				peer instanceof RpcPeerImpl &&
				(peer.state.status === "connected" ||
					peer.state.status === "recovering"),
		);
		if (peers.length === 0) {
			return Promise.resolve(Object.freeze([]));
		}

		const reservations: RpcPeerInvocationReservation[] = [];
		try {
			for (const peer of peers) {
				const reservation = peer.reserveOutgoingProtocolInvocation(
					service,
					method,
					args,
				);
				if (reservation === undefined) {
					for (const retained of reservations) {
						retained.release();
					}
					return Promise.reject(createRpcError("unavailable"));
				}
				reservations.push(reservation);
			}
		} catch (error) {
			for (const retained of reservations) {
				try {
					retained.release();
				} catch {
					// The first Protocol fault remains authoritative.
				}
			}
			return Promise.reject(error);
		}

		const invocations: RpcPeerCommittedInvocation[] = [];
		try {
			for (const reservation of reservations) {
				invocations.push(reservation.commit());
			}
		} catch (error) {
			for (
				let index = invocations.length;
				index < reservations.length;
				index += 1
			) {
				try {
					reservations[index]?.release();
				} catch {
					// The commit fault remains authoritative.
				}
			}
			return Promise.reject(error);
		}

		let removeAbortListener: (() => void) | undefined;
		if (prepared.signal !== undefined) {
			removeAbortListener = installRpcAbortListener(prepared.signal, () => {
				for (const invocation of invocations) {
					invocation.cancel();
				}
			});
		}
		const results = invocations.map((invocation, index) =>
			invocation.result.then(
				(value) =>
					Object.freeze<RpcPeerResult<unknown>>({
						peer: peers[index] as RpcPeerImpl,
						status: "fulfilled",
						value,
					}),
				(error) =>
					Object.freeze<RpcPeerResult<unknown>>({
						peer: peers[index] as RpcPeerImpl,
						status: "rejected",
						reason: error,
					}),
			),
		);
		for (const invocation of invocations) {
			invocation.start();
		}
		return Promise.all(results).then((settled) => {
			removeAbortListener?.();
			return Object.freeze(settled);
		});
	}

	shutdown(): Promise<void> {
		if (this.#terminationTask !== undefined) {
			return this.#terminationTask;
		}
		const task = this.#createTerminationTask();
		this.#beginGracefulShutdown();
		return task;
	}

	close(): Promise<void> {
		const task = this.#terminationTask ?? this.#createTerminationTask();
		if (this.state.status === "active" || this.state.status === "draining") {
			this.#beginClosing("forced-close", true);
		}
		return task;
	}

	#createTerminationTask(): Promise<void> {
		const task = new Promise<void>((resolve, reject) => {
			this.#resolveTermination = resolve;
			this.#rejectTermination = reject;
		});
		this.#terminationTask = task;
		void task.catch(() => {});
		return task;
	}

	#beginGracefulShutdown(): void {
		if (this.state.status !== "active") {
			return;
		}
		this.#stageState(Object.freeze({ status: "draining" }));
		this.#graceTimer = setTimeout(
			() => this.#beginClosing("shutdown-deadline", true),
			this.#policy.shutdownDeadlineMs,
		);
		const peerEvents: RpcEvent[] = [];
		const changedPeers: RpcPeerImpl[] = [];
		const terminalPeers: RpcPeerImpl[] = [];
		const terminalSessions: IRpcProtocolSession[] = [];
		for (const [session, peer] of this.#sessions) {
			if (peer.state.status === "connected") {
				peer.stageState({
					status: "draining",
					reason: "graceful-shutdown",
				});
				changedPeers.push(peer);
				peerEvents.push({
					type: "peer-draining",
					peer,
					reason: "graceful-shutdown",
				});
			} else if (peer.state.status === "recovering") {
				peer.stageState({
					status: "closed",
					outcome: "normal",
					reason: "forced-close",
				});
				this.#sessions.delete(session);
				terminalSessions.push(session);
				changedPeers.push(peer);
				terminalPeers.push(peer);
				peerEvents.push({
					type: "peer-closed",
					peer,
					outcome: "normal",
					reason: "forced-close",
				});
			}
		}
		if (terminalPeers.length > 0) {
			const terminalSet = new Set<IRpcPeer>(terminalPeers);
			this.#stagePeers(
				Object.freeze(this.#peers.filter((peer) => !terminalSet.has(peer))),
			);
		}
		this.#abortListener();
		for (const session of terminalSessions) {
			this.#faultingSessions.add(session);
			try {
				session.forceClose();
			} catch {
				// Graceful cutoff still locally forces a recovering Session.
			} finally {
				this.#faultingSessions.delete(session);
			}
		}
		this.#flushState();
		if (terminalPeers.length > 0) {
			this.#flushPeers();
		}
		for (const peer of changedPeers) {
			peer.flushState();
		}
		this.#eventSubject.next({ type: "owner-draining" });
		for (const event of peerEvents) {
			this.#eventSubject.next(event);
		}
		for (const peer of terminalPeers) {
			peer.completeState();
		}

		let grace: Promise<unknown>;
		try {
			grace = Promise.resolve(this.#runtime.shutdown());
		} catch {
			this.#beginClosing("forced-close", true);
			return;
		}
		grace.then(
			() => {
				if (this.state.status === "draining") {
					this.#beginClosing("graceful-shutdown", false);
				}
			},
			() => this.#beginClosing("forced-close", true),
		);
	}

	#beginClosing(
		reason: "graceful-shutdown" | "forced-close" | "shutdown-deadline",
		forced: boolean,
	): void {
		if (this.state.status === "closing" || this.state.status === "closed") {
			return;
		}
		if (this.#graceTimer !== undefined) {
			clearTimeout(this.#graceTimer);
			this.#graceTimer = undefined;
		}
		this.#stageState(Object.freeze({ status: "closing" }));
		const peerClosures = this.#stageRemainingPeers(reason);
		this.#abortListener();
		if (forced) {
			try {
				this.#runtime.close();
			} catch {
				// Only cleanup failure rejects the shared termination task.
			}
		}
		this.#flushState();
		if (peerClosures.membershipChanged) {
			this.#flushPeers();
		}
		for (const peer of peerClosures.peers) {
			peer.flushState();
		}
		for (const event of peerClosures.events) {
			this.#eventSubject.next(event);
		}
		for (const peer of peerClosures.peers) {
			peer.completeState();
		}
		this.#eventSubject.next({ type: "owner-closing" });
		this.#startCleanup(
			Object.freeze({ status: "closed", outcome: "normal", reason }),
		);
	}

	#stageRemainingPeers(
		reason: "graceful-shutdown" | "forced-close" | "shutdown-deadline",
	): {
		readonly events: readonly RpcEvent[];
		readonly peers: readonly RpcPeerImpl[];
		readonly membershipChanged: boolean;
	} {
		const closeEvents: RpcEvent[] = [];
		const terminalPeers: RpcPeerImpl[] = [];
		const membershipChanged = this.#peers.length > 0;
		for (const peer of this.#sessions.values()) {
			if (
				reason === "graceful-shutdown" &&
				peer.state.status === "draining" &&
				peer.state.reason === "counter-exhaustion"
			) {
				peer.stageState({
					status: "closed",
					outcome: "failed",
					reason: "counter-exhaustion",
					error: createRpcError("unavailable"),
				});
				closeEvents.push({
					type: "peer-closed",
					peer,
					outcome: "failed",
					reason: "counter-exhaustion",
				});
			} else {
				peer.stageState({ status: "closed", outcome: "normal", reason });
				closeEvents.push({
					type: "peer-closed",
					peer,
					outcome: "normal",
					reason,
				});
			}
			terminalPeers.push(peer);
		}
		this.#sessions.clear();
		if (membershipChanged) {
			this.#stagePeers(Object.freeze([]));
		}
		return { events: closeEvents, peers: terminalPeers, membershipChanged };
	}

	#abortListener(): void {
		const attempt = this.#listenerAttempt;
		if (attempt === undefined) {
			return;
		}
		attempt.cleanupRequested = true;
		attempt.terminal = true;
		this.#listenerAttempt = undefined;
		attempt.abortController.abort();
		if (!attempt.ready) {
			attempt.reject(
				new DOMException(
					"The listener was aborted by its owner.",
					"AbortError",
				),
			);
		}
		this.#startListenerAttemptCleanup(attempt);
	}

	#startListenerAttemptCleanup(
		attempt: RpcAcceptorListenerAttempt,
	): Promise<void> {
		if (attempt.cleanupBarrier !== undefined) {
			return attempt.cleanupBarrier;
		}
		const barrier = Promise.all([
			this.#startOwnedCleanup(attempt.listenerCleanup),
			this.#startOwnedCleanup(attempt.startupCleanup),
		]).then(() => undefined);
		attempt.cleanupBarrier = barrier;
		this.#listenerCleanupBarrier = barrier;
		void barrier.then(
			() => {
				if (this.#listenerCleanupBarrier === barrier) {
					this.#listenerCleanupBarrier = undefined;
				}
			},
			() => {},
		);
		return barrier;
	}

	#startCleanup(finalState: RpcAcceptorClosedState): void {
		this.#admitOwnedCleanup(() => this.#runtime.cleanup());
		const cleanups = this.#cleanupLedger.map((entry) =>
			this.#startOwnedCleanup(entry),
		);
		this.#cleanupTimer = setTimeout(() => {
			const errors = this.#collectOwnedCleanupErrors();
			errors.push(new Error("RPC Owner cleanup exceeded its deadline."));
			this.#finishCleanupFailure(this.#combineOwnedCleanupErrors(errors));
		}, this.#policy.shutdownDeadlineMs);
		void Promise.allSettled(cleanups).then(() => {
			if (this.state.status !== "closing") {
				return;
			}
			const errors = this.#collectOwnedCleanupErrors();
			if (errors.length === 0) {
				this.#finishCleanupSuccess(finalState);
			} else {
				this.#finishCleanupFailure(this.#combineOwnedCleanupErrors(errors));
			}
		});
	}

	#collectOwnedCleanupErrors(): Error[] {
		const errors: Error[] = [];
		for (const entry of this.#cleanupLedger) {
			if (entry.error !== undefined) {
				errors.push(entry.error);
			}
		}
		return errors;
	}

	#combineOwnedCleanupErrors(errors: readonly Error[]): Error {
		return errors.length === 1
			? (errors[0] as Error)
			: new AggregateError(errors, "RPC Owner cleanup failed.");
	}

	#finishCleanupSuccess(finalState: RpcAcceptorClosedState): void {
		if (this.state.status !== "closing") {
			return;
		}
		this.#clearCleanupTimer();
		this.#commitState(finalState);
		this.#detachOwnedCleanupState();
		this.#stateSubject.complete();
		this.#peersSubject.complete();
		if (finalState.outcome === "normal") {
			this.#eventSubject.next({
				type: "topology-closed",
				outcome: "normal",
				reason: finalState.reason,
			});
		} else {
			this.#eventSubject.next({
				type: "topology-closed",
				outcome: "failed",
				reason: finalState.reason,
			});
		}
		this.#eventSubject.complete();
		this.#resolveTermination?.();
	}

	#finishCleanupFailure(value: unknown): void {
		if (this.state.status !== "closing") {
			return;
		}
		this.#clearCleanupTimer();
		const error =
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
		this.#commitState(
			Object.freeze({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			}),
		);
		this.#detachOwnedCleanupState();
		this.#stateSubject.complete();
		this.#peersSubject.complete();
		this.#eventSubject.next({
			type: "topology-closed",
			outcome: "failed",
			reason: "cleanup-failed",
		});
		this.#eventSubject.complete();
		this.#rejectTermination?.(error);
	}

	#detachOwnedCleanupState(): void {
		for (const subscription of this.#connectionTerminalSubscriptions.values()) {
			try {
				subscription.unsubscribe();
			} catch {
				// Final cleanup has already selected its authoritative outcome.
			}
		}
		this.#connectionTerminalSubscriptions.clear();
		this.#ownedConnections.splice(0);
		this.#cleanupLedger.splice(0);
		this.#overflowConnection = undefined;
		this.#listenerCleanupBarrier = undefined;
	}

	#clearCleanupTimer(): void {
		if (this.#cleanupTimer !== undefined) {
			clearTimeout(this.#cleanupTimer);
			this.#cleanupTimer = undefined;
		}
	}

	/** Package-private Protocol admission port. */
	admitProtocolSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		if (
			this.state.status !== "active" ||
			this.#insideConnectionHandoff ||
			this.#sessions.size >= this.#policy.maxSessions ||
			this.#sessions.has(session) ||
			typeof session !== "object" ||
			session === null ||
			typeof session.reserveInvocation !== "function" ||
			typeof session.forceClose !== "function"
		) {
			return undefined;
		}

		const peer = new RpcPeerImpl(
			{ status: "connected" },
			this.#ownerExposureRegistry,
			() => this.state.status === "active",
			(event) => this.#eventSubject.next(event),
			(error) => this.#faultSession(session, "protocol-fault", error),
			this.#handlerScheduler,
			Math.floor(this.#policy.maxRetainedBytesPerSession / 4),
		);
		peer.attachProtocolSession(session);
		this.#sessions.set(session, peer);
		this.#commitPeers(Object.freeze([...this.#peers, peer]));
		this.#eventSubject.next({ type: "peer-opened", peer });
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request) =>
				peer.reserveIncomingProtocolCall(request),
			transition: (transition) => this.#transitionSession(session, transition),
			fault: (reason, error) => this.#faultSession(session, reason, error),
		});
	}

	#faultSession(
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		if (this.#faultingSessions.has(session)) {
			return;
		}
		this.#faultingSessions.add(session);
		try {
			try {
				session.forceClose();
			} catch {
				// The original Session fault remains authoritative.
			}
			if (this.#sessions.has(session)) {
				this.#closePeerFromSession(session, reason, error);
			}
		} finally {
			this.#faultingSessions.delete(session);
		}
	}

	#transitionSession(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		if (this.#faultingSessions.has(session)) {
			return;
		}
		if (this.state.status === "closing" || this.state.status === "closed") {
			return;
		}
		const peer = this.#sessions.get(session);
		if (peer === undefined) {
			this.#faultSession(
				session,
				"protocol-fault",
				new Error("Protocol repeated a terminal Session transition."),
			);
			return;
		}
		if (!this.#isSessionTransitionAllowed(peer, transition)) {
			this.#faultSession(
				session,
				"protocol-fault",
				new Error("Protocol requested an invalid Session transition."),
			);
			return;
		}
		if (transition.type === "recovering") {
			peer.commitState({ status: "recovering" });
			this.#eventSubject.next({ type: "peer-recovering", peer });
			return;
		}
		if (transition.type === "recovered") {
			peer.commitState({ status: "connected" });
			this.#eventSubject.next({ type: "peer-recovered", peer });
			return;
		}
		if (transition.type === "draining") {
			peer.commitState({
				status: "draining",
				reason: "counter-exhaustion",
			});
			this.#eventSubject.next({
				type: "peer-draining",
				peer,
				reason: "counter-exhaustion",
			});
			return;
		}
		this.#closePeerFromSession(session, transition.reason, transition.cause);
	}

	#isSessionTransitionAllowed(
		peer: RpcPeerImpl,
		transition: RpcProtocolSessionTransition,
	): boolean {
		const ownerStatus = this.state.status;
		const peerState = peer.state;
		if (ownerStatus === "draining") {
			return (
				transition.type === "closed" &&
				peerState.status === "draining" &&
				transition.reason !== "recovery-expired" &&
				(transition.reason !== "counter-exhaustion" ||
					peerState.reason === "counter-exhaustion")
			);
		}
		if (ownerStatus !== "active") {
			return false;
		}
		if (transition.type === "recovering") {
			return peerState.status === "connected";
		}
		if (transition.type === "recovered") {
			return peerState.status === "recovering";
		}
		if (transition.type === "draining") {
			return (
				peerState.status === "connected" || peerState.status === "recovering"
			);
		}
		if (transition.reason === "recovery-expired") {
			return peerState.status === "recovering";
		}
		if (transition.reason === "counter-exhaustion") {
			return (
				peerState.status === "draining" &&
				peerState.reason === "counter-exhaustion"
			);
		}
		return transition.reason !== "graceful-shutdown";
	}

	#closePeerFromSession(
		session: IRpcProtocolSession,
		reason: RpcSessionCloseReason,
		cause?: Error,
	): void {
		const peer = this.#sessions.get(session);
		if (peer === undefined || peer.state.status === "closed") {
			return;
		}
		let closeEvent: Extract<RpcEvent, { readonly type: "peer-closed" }>;
		if (reason === "recovery-expired" || reason === "counter-exhaustion") {
			peer.stageState({
				status: "closed",
				outcome: "failed",
				reason,
				error: createRpcError("unavailable", cause),
			});
			closeEvent = {
				type: "peer-closed",
				peer,
				outcome: "failed",
				reason,
			};
		} else if (
			reason === "continuity-failure" ||
			reason === "protocol-fault" ||
			reason === "resource-fault"
		) {
			peer.stageState({
				status: "closed",
				outcome: "failed",
				reason,
				error: createRpcError("protocol", cause),
			});
			closeEvent = {
				type: "peer-closed",
				peer,
				outcome: "failed",
				reason,
			};
		} else {
			peer.stageState({ status: "closed", outcome: "normal", reason });
			closeEvent = {
				type: "peer-closed",
				peer,
				outcome: "normal",
				reason,
			};
		}
		this.#sessions.delete(session);
		this.#stagePeers(
			Object.freeze(this.#peers.filter((candidate) => candidate !== peer)),
		);
		peer.flushState();
		this.#flushPeers();
		this.#eventSubject.next(closeEvent);
		peer.completeState();
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		if (this.state.status === "closing" || this.state.status === "closed") {
			return;
		}
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		if (this.#graceTimer !== undefined) {
			clearTimeout(this.#graceTimer);
			this.#graceTimer = undefined;
		}
		this.#abortListener();
		try {
			this.#runtime.close();
		} catch {
			// The original shared Protocol fault remains authoritative.
		}

		const faultError = createRpcError("protocol", error);
		const terminalPeers = [...this.#sessions.values()];
		const membershipChanged = this.#peers.length > 0;
		this.#sessions.clear();
		for (const peer of terminalPeers) {
			peer.stageState({
				status: "closed",
				outcome: "failed",
				reason,
				error: faultError,
			});
		}
		if (membershipChanged) {
			this.#stagePeers(Object.freeze([]));
		}
		this.#stageState(Object.freeze({ status: "closing" }));
		this.#flushState();
		if (membershipChanged) {
			this.#flushPeers();
		}
		for (const peer of terminalPeers) {
			peer.flushState();
		}
		for (const peer of terminalPeers) {
			this.#eventSubject.next({
				type: "peer-closed",
				peer,
				outcome: "failed",
				reason,
			});
			peer.completeState();
		}
		this.#eventSubject.next({ type: "owner-closing" });
		this.#startCleanup(
			Object.freeze({
				status: "closed",
				outcome: "failed",
				reason,
				error: faultError,
			}),
		);
	}
}
