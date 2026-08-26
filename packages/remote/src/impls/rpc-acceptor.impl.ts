/**
 * @overview Acceptor Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { Observable, Subject, type Subscription } from "rxjs";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcAcceptorListenerStopReasonEnum } from "@/enums/rpc-acceptor-listener-stop-reason.enum";
import { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcRetainedBytesLedger } from "@/interfaces/protocol/rpc-retained-bytes-ledger.interface";
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
import type { IRpcHandlerScheduler } from "@/interfaces/rpc-handler-scheduler.interface";
import type { IRpcOwnerCustody } from "@/interfaces/rpc-owner-custody.interface";
import type {
	IRpcPeerCommittedInvocation,
	IRpcPeerInvocationReservation,
	IRpcPeerRuntime,
} from "@/interfaces/rpc-peer.interface";
import type {
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/remote-service-descriptor.type";
import type {
	RpcAcceptorListenerState,
	RpcAcceptorState,
} from "@/types/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/rpc-exposure.type";
import type { CreateRpcAcceptorImplOptions } from "@/types/rpc-owner.type";
import type {
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/types/rpc-owner-custody.type";
import type { RpcPeerFactory } from "@/types/rpc-peer.type";
import { normalizeRpcApplicationArguments } from "@/utils/rpc-application-value.util";
import {
	installRpcAbortListener,
	prepareRpcInvocationArguments,
} from "@/utils/rpc-cancellation.util";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
import { createRpcFacade } from "@/utils/rpc-facade.util";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import { isRpcSessionTransitionAllowed } from "@/utils/rpc-session-transition.util";
import {
	isCallable,
	isNonNullObject,
	isUndefined,
} from "@/utils/type-guard.util";

function isProtocolSession(value: unknown): value is IRpcProtocolSession {
	if (!isNonNullObject(value)) {
		return false;
	}
	const session = value as object;
	return (
		isCallable(Reflect.get(session, "reserveInvocation")) &&
		isCallable(Reflect.get(session, "forceClose"))
	);
}

interface RpcAcceptorListenerAttempt {
	readonly abortController: AbortController;
	readonly resolve: () => void;
	readonly reject: (error: unknown) => void;
	readonly listenerCleanup: RpcOwnedCleanup;
	readonly startupCleanup: RpcOwnedCleanup;
	subscription?: Subscription;
	ready: boolean;
	terminal: boolean;
	cleanupRequested: boolean;
	cleanupBarrier?: Promise<void>;
}

type RpcAcceptorClosedState = Extract<
	RpcAcceptorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

/** Owns Acceptor listener state and its current stable peer membership. */
export class RpcAcceptorImpl implements IRpcAcceptor {
	readonly #runtime: IRpcProtocolAcceptorRuntime;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #ownerExposureRegistry: RpcExposureRegistry = new Map();
	readonly #stateSubject = new Subject<RpcAcceptorState>();
	readonly #peersSubject = new Subject<readonly IRpcPeer[]>();
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #sessions = new Map<IRpcProtocolSession, IRpcPeerRuntime>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #custody: IRpcOwnerCustody;
	readonly #createPeer: RpcPeerFactory;
	readonly #ordinaryConnectionLimit: number;
	#state: RpcAcceptorState;
	#peers: readonly IRpcPeerRuntime[];
	#overflowConnection: RpcOwnedConnection | undefined;
	#listenerCleanupBarrier: Promise<void> | undefined;
	#listenerAttempt: RpcAcceptorListenerAttempt | undefined;
	#insideConnectionHandoff = false;
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;
	#rejectTermination: ((error: unknown) => void) | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	readonly state$: Observable<RpcAcceptorState>;
	readonly peers$: Observable<readonly IRpcPeer[]>;
	readonly event$: Observable<RpcEvent>;

	constructor(options: CreateRpcAcceptorImplOptions) {
		const {
			createPeer,
			custody,
			handlerScheduler,
			policy,
			retainedBytesLedger,
			runtime,
		} = options;
		this.#runtime = runtime;
		this.#policy = policy;
		this.#custody = custody;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#handlerScheduler = handlerScheduler;
		this.#createPeer = createPeer;
		this.#ordinaryConnectionLimit =
			policy.maxSessions + 2 * policy.maxHandshakes;
		const listener = Object.freeze({
			status: RpcStateStatusEnum.idle as const,
		});
		this.#state = Object.freeze<RpcAcceptorState>({
			status: RpcStateStatusEnum.active,
			listener,
		});
		this.#peers = Object.freeze<readonly IRpcPeerRuntime[]>([]);
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

	/** Package-private Protocol retained-byte reservation port. */
	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this.#retainedBytesLedger.reserve(bytes);
	}

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		if (this.state.status !== RpcStateStatusEnum.active) {
			throw createRpcException(RpcExceptionCodeEnum.unavailable);
		}
		return installRpcExposure(
			descriptor,
			implementation,
			this.#ownerExposureRegistry,
			this.#peers.map((peer) => peer.localExposureRegistry),
		);
	}

	listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		return Promise.try(() => this.#listen(adapter));
	}

	#listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		// Listening starts only from an idle owner with no prior listener resources.
		const listenerIsUnavailable =
			this.state.status !== RpcStateStatusEnum.active ||
			(this.state.listener.status !== RpcStateStatusEnum.idle &&
				this.state.listener.status !== RpcStateStatusEnum.stopped) ||
			this.#listenerAttempt !== undefined ||
			this.#listenerCleanupBarrier !== undefined ||
			this.#overflowConnection !== undefined;
		if (listenerIsUnavailable) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		if (!isNonNullObject(adapter)) {
			return Promise.reject(new TypeError("adapter must be an object."));
		}
		const connectionSource = Reflect.get(adapter, "connection$") as unknown;
		const listen = Reflect.get(adapter, "listen");
		const subscribe = isUndefined(connectionSource)
			? undefined
			: Reflect.get(connectionSource as object, "subscribe");
		// An Acceptor Adapter must provide callable subscription and listen entrypoints.
		const adapterShapeIsInvalid = !isCallable(subscribe) || !isCallable(listen);
		if (adapterShapeIsInvalid) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}
		const validConnectionSource =
			connectionSource as Observable<IRpcConnection>;

		const {
			promise: startup,
			resolve: resolveStartup,
			reject: rejectStartup,
		} = Promise.withResolvers<void>();
		const {
			promise: adapterStartup,
			resolve: resolveAdapterStartup,
			reject: rejectAdapterStartup,
		} = Promise.withResolvers<void>();
		let attempt!: RpcAcceptorListenerAttempt;
		const startupCleanupTask = Promise.race([
			adapterStartup.then(
				() => undefined,
				(error: unknown) => {
					// Cleanup suppresses only the AbortError produced by its own cancellation.
					const cleanupFailed =
						attempt.cleanupRequested &&
						!(error instanceof DOMException && error.name === "AbortError");
					if (cleanupFailed) {
						throw error;
					}
				},
			),
			// Give a synchronous Adapter abort rejection first claim on cleanup.
			startup
				.then(
					() => undefined,
					() => undefined,
				)
				.then(() => undefined),
		]);
		void startupCleanupTask.catch(() => {});
		const listenerCleanup = this.#custody.ownCleanup(() =>
			attempt.subscription?.unsubscribe(),
		);
		const startupCleanup = this.#custody.ownCleanup(() => startupCleanupTask);
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
		this.#commitListener({ status: RpcStateStatusEnum.starting });

		try {
			attempt.subscription = validConnectionSource.subscribe({
				next: (connection) => this.#acceptConnection(connection),
				error: (error) => this.#terminalListener(attempt, "error", error),
				complete: () => this.#terminalListener(attempt, "complete"),
			});
		} catch (error) {
			resolveAdapterStartup();
			this.#terminalListener(attempt, "error", error);
			return startup;
		}

		try {
			Promise.resolve(
				Reflect.apply(listen, adapter, [attempt.abortController.signal]),
			).then(resolveAdapterStartup, rejectAdapterStartup);
		} catch (error) {
			rejectAdapterStartup(error);
		}
		adapterStartup.then(
			() => {
				if (attempt.terminal || this.#listenerAttempt !== attempt) {
					return;
				}
				attempt.ready = true;
				this.#commitListener({ status: RpcStateStatusEnum.listening });
				attempt.resolve();
			},
			(error) => this.#terminalListener(attempt, "error", error),
		);

		return startup;
	}

	#commitListener(listener: RpcAcceptorListenerState): void {
		if (this.state.status !== RpcStateStatusEnum.active) {
			return;
		}
		this.#commitState(
			Object.freeze<RpcAcceptorState>({
				status: RpcStateStatusEnum.active as const,
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

	#commitPeers(peers: readonly IRpcPeerRuntime[]): void {
		this.#stagePeers(peers);
		this.#flushPeers();
	}

	#stagePeers(peers: readonly IRpcPeerRuntime[]): void {
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
				status: RpcStateStatusEnum.stopped,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: RpcAcceptorListenerStopReasonEnum.completed,
			});
			if (!attempt.ready) {
				attempt.abortController.abort();
				attempt.reject(createRpcException(RpcExceptionCodeEnum.unavailable));
			}
		} else {
			const error =
				value instanceof Error ? value : new Error("Adapter listener failed.");
			this.#commitListener({
				status: RpcStateStatusEnum.stopped,
				outcome: RpcCloseOutcomeEnum.failed,
				error,
			});
			if (!attempt.ready) {
				attempt.abortController.abort();
				attempt.reject(
					createRpcException(RpcExceptionCodeEnum.unavailable, error),
				);
			}
		}
	}

	#acceptConnection(connection: IRpcConnection): void {
		const connectionCount = this.#custody.connectionCount;
		const ownedConnection = this.#custody.ownConnection(connection);
		// A Connection can proceed only while the current listener attempt is active.
		const listenerCannotAcceptConnection =
			this.state.status !== RpcStateStatusEnum.active ||
			this.#listenerAttempt === undefined ||
			this.#listenerAttempt.terminal;
		if (listenerCannotAcceptConnection) {
			queueMicrotask(() => ownedConnection.directClose());
			return;
		}
		const ordinaryConnectionCount =
			connectionCount - (this.#overflowConnection === undefined ? 0 : 1);
		if (ordinaryConnectionCount >= this.#ordinaryConnectionLimit) {
			this.#acceptOverflowConnection(ownedConnection);
			return;
		}
		this.#insideConnectionHandoff = true;
		let acceptance: Promise<unknown>;
		try {
			acceptance = Promise.resolve(
				this.#runtime.accept(
					ownedConnection.connection,
					this.#listenerAttempt?.abortController.signal ??
						new AbortController().signal,
				),
			);
		} catch (error) {
			acceptance = Promise.reject(error);
		} finally {
			this.#insideConnectionHandoff = false;
		}
		void acceptance.catch(() => ownedConnection.directClose());
	}

	#acceptOverflowConnection(connection: RpcOwnedConnection): void {
		if (this.#overflowConnection !== undefined) {
			queueMicrotask(() => connection.directClose());
			return;
		}
		this.#overflowConnection = connection;
		this.#stopListenerForResourcePressure();
		queueMicrotask(() => {
			const task = connection.directClose();
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
			status: RpcStateStatusEnum.stopped,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcAcceptorListenerStopReasonEnum.resourcePressure,
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

	#releaseOverflowConnection(connection: RpcOwnedConnection): void {
		if (this.#overflowConnection === connection) {
			this.#overflowConnection = undefined;
		}
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
		if (this.state.status !== RpcStateStatusEnum.active) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const args = normalizeRpcApplicationArguments(
			prepared.applicationArguments,
		);
		const peers = this.#peers.filter(
			(peer) =>
				peer.state.status === RpcStateStatusEnum.connected ||
				peer.state.status === RpcStateStatusEnum.recovering,
		);
		if (peers.length === 0) {
			return Promise.resolve(Object.freeze([]));
		}

		const reservations: IRpcPeerInvocationReservation[] = [];
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
					return Promise.reject(
						createRpcException(RpcExceptionCodeEnum.unavailable),
					);
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

		const invocations: IRpcPeerCommittedInvocation[] = [];
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
		for (const invocation of invocations) {
			invocation.start();
		}
		return Promise.allSettled(
			invocations.map((invocation) => invocation.result),
		).then((results) => {
			removeAbortListener?.();
			return Object.freeze(
				results.map((result, index) =>
					Object.freeze<RpcPeerResult<unknown>>(
						result.status === "fulfilled"
							? {
									peer: peers[index] as IRpcPeerRuntime,
									status: RpcCallStatusEnum.fulfilled,
									value: result.value,
								}
							: {
									peer: peers[index] as IRpcPeerRuntime,
									status: RpcCallStatusEnum.rejected,
									reason: result.reason,
								},
					),
				),
			);
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
		// Forced close starts only from a live owner state.
		const canBeginForcedClose =
			this.state.status === RpcStateStatusEnum.active ||
			this.state.status === RpcStateStatusEnum.draining;
		if (canBeginForcedClose) {
			this.#beginClosing(RpcCloseReasonEnum.forcedClose, true);
		}
		return task;
	}

	#createTerminationTask(): Promise<void> {
		const termination = Promise.withResolvers<void>();
		const task = termination.promise;
		this.#resolveTermination = termination.resolve;
		this.#rejectTermination = termination.reject;
		this.#terminationTask = task;
		void task.catch(() => {});
		return task;
	}

	#beginGracefulShutdown(): void {
		if (this.state.status !== RpcStateStatusEnum.active) {
			return;
		}
		this.#stageState(Object.freeze({ status: RpcStateStatusEnum.draining }));
		this.#graceTimer = setTimeout(
			() => this.#beginClosing(RpcCloseReasonEnum.shutdownDeadline, true),
			this.#policy.shutdownDeadlineMs,
		);
		const peerEvents: RpcEvent[] = [];
		const changedPeers: IRpcPeerRuntime[] = [];
		const terminalPeers: IRpcPeerRuntime[] = [];
		const terminalSessions: IRpcProtocolSession[] = [];
		for (const [session, peer] of this.#sessions) {
			if (peer.state.status === RpcStateStatusEnum.connected) {
				peer.stageState({
					status: RpcStateStatusEnum.draining,
					reason: RpcCloseReasonEnum.gracefulShutdown,
				});
				changedPeers.push(peer);
				peerEvents.push({
					type: RpcEventTypeEnum.peerDraining,
					peer,
					reason: RpcCloseReasonEnum.gracefulShutdown,
				});
			} else if (peer.state.status === RpcStateStatusEnum.recovering) {
				peer.stageState({
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
				});
				this.#sessions.delete(session);
				terminalSessions.push(session);
				changedPeers.push(peer);
				terminalPeers.push(peer);
				peerEvents.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
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
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerDraining });
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
			this.#beginClosing(RpcCloseReasonEnum.forcedClose, true);
			return;
		}
		grace.then(
			() => {
				if (this.state.status === RpcStateStatusEnum.draining) {
					this.#beginClosing(RpcCloseReasonEnum.gracefulShutdown, false);
				}
			},
			() => this.#beginClosing(RpcCloseReasonEnum.forcedClose, true),
		);
	}

	#beginClosing(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
		forced: boolean,
	): void {
		// Closing is idempotent once the owner is closing or closed.
		const terminationAlreadyStarted =
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed;
		if (terminationAlreadyStarted) {
			return;
		}
		if (this.#graceTimer !== undefined) {
			clearTimeout(this.#graceTimer);
			this.#graceTimer = undefined;
		}
		this.#stageState(Object.freeze({ status: RpcStateStatusEnum.closing }));
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
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerClosing });
		this.#startCleanup(
			Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			}),
		);
	}

	#stageRemainingPeers(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
	): {
		readonly events: readonly RpcEvent[];
		readonly peers: readonly IRpcPeerRuntime[];
		readonly membershipChanged: boolean;
	} {
		const closeEvents: RpcEvent[] = [];
		const terminalPeers: IRpcPeerRuntime[] = [];
		const membershipChanged = this.#peers.length > 0;
		for (const peer of this.#sessions.values()) {
			// Counter-draining peers remain failed when graceful owner shutdown wins.
			const counterDrainFailedDuringShutdown =
				reason === RpcCloseReasonEnum.gracefulShutdown &&
				peer.state.status === RpcStateStatusEnum.draining &&
				peer.state.reason === RpcCloseReasonEnum.counterExhaustion;
			if (counterDrainFailedDuringShutdown) {
				peer.stageState({
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason: RpcCloseReasonEnum.counterExhaustion,
					error: createRpcException(RpcExceptionCodeEnum.unavailable),
				});
				closeEvents.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.failed,
					reason: RpcCloseReasonEnum.counterExhaustion,
				});
			} else {
				peer.stageState({
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				});
				closeEvents.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
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
			attempt.listenerCleanup.start(),
			attempt.startupCleanup.start(),
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
		void this.#custody.finishCleanup().then(
			() => this.#finishCleanupSuccess(finalState),
			(error: unknown) => this.#finishCleanupFailure(error),
		);
	}

	#finishCleanupSuccess(finalState: RpcAcceptorClosedState): void {
		if (this.state.status !== RpcStateStatusEnum.closing) {
			return;
		}
		this.#commitState(finalState);
		this.#clearCleanupReferences();
		this.#stateSubject.complete();
		this.#peersSubject.complete();
		if (finalState.outcome === RpcCloseOutcomeEnum.normal) {
			this.#eventSubject.next({
				type: RpcEventTypeEnum.topologyClosed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: finalState.reason,
			});
		} else {
			this.#eventSubject.next({
				type: RpcEventTypeEnum.topologyClosed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: finalState.reason,
			});
		}
		this.#eventSubject.complete();
		this.#resolveTermination?.();
	}

	#finishCleanupFailure(value: unknown): void {
		if (this.state.status !== RpcStateStatusEnum.closing) {
			return;
		}
		const error =
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
		this.#commitState(
			Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.cleanupFailed,
				error,
			}),
		);
		this.#clearCleanupReferences();
		this.#stateSubject.complete();
		this.#peersSubject.complete();
		this.#eventSubject.next({
			type: RpcEventTypeEnum.topologyClosed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.cleanupFailed,
		});
		this.#eventSubject.complete();
		this.#rejectTermination?.(error);
	}

	#clearCleanupReferences(): void {
		this.#overflowConnection = undefined;
		this.#listenerCleanupBarrier = undefined;
	}

	/** Package-private Protocol admission port. */
	admitProtocolSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		// Session admission requires active ownership, capacity, uniqueness, and a valid SPI object.
		const cannotAdmitSession =
			this.state.status !== RpcStateStatusEnum.active ||
			this.#insideConnectionHandoff ||
			this.#sessions.size >= this.#policy.maxSessions ||
			this.#sessions.has(session) ||
			!isProtocolSession(session);
		if (cannotAdmitSession) {
			return undefined;
		}

		const peer = this.#createPeer({
			initialState: { status: RpcStateStatusEnum.connected },
			ownerExposureRegistry: this.#ownerExposureRegistry,
			isOwnerActive: () => this.state.status === RpcStateStatusEnum.active,
			emitEvent: (event) => this.#eventSubject.next(event),
			onProtocolFault: (error) =>
				this.#faultSession(session, RpcCloseReasonEnum.protocolFault, error),
			handlerScheduler: this.#handlerScheduler,
			maximumIncomingBytes: Math.floor(
				this.#policy.maxRetainedBytesPerSession / 4,
			),
			reserveRetainedBytes: (bytes) =>
				reserveRpcSessionRetainedBytes(
					session,
					(ownerBytes) => this.reserveRetainedBytes(ownerBytes),
					bytes,
				),
		});
		peer.attachProtocolSession(session);
		this.#sessions.set(session, peer);
		this.#commitPeers(Object.freeze([...this.#peers, peer]));
		this.#eventSubject.next({ type: RpcEventTypeEnum.peerOpened, peer });
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
		// Terminal owners ignore all later Session transitions.
		const ownerIsTerminal =
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed;
		if (ownerIsTerminal) {
			return;
		}
		const peer = this.#sessions.get(session);
		if (peer === undefined) {
			this.#faultSession(
				session,
				RpcCloseReasonEnum.protocolFault,
				new Error("Protocol repeated a terminal Session transition."),
			);
			return;
		}
		if (
			!isRpcSessionTransitionAllowed(this.state.status, peer.state, transition)
		) {
			this.#faultSession(
				session,
				RpcCloseReasonEnum.protocolFault,
				new Error("Protocol requested an invalid Session transition."),
			);
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
			peer.commitState({ status: RpcStateStatusEnum.recovering });
			this.#eventSubject.next({ type: RpcEventTypeEnum.peerRecovering, peer });
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
			peer.commitState({ status: RpcStateStatusEnum.connected });
			this.#eventSubject.next({ type: RpcEventTypeEnum.peerRecovered, peer });
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
			peer.commitState({
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			});
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerDraining,
				peer,
				reason: RpcCloseReasonEnum.counterExhaustion,
			});
			return;
		}
		this.#closePeerFromSession(session, transition.reason, transition.cause);
	}

	#closePeerFromSession(
		session: IRpcProtocolSession,
		reason: RpcSessionCloseReason,
		cause?: Error,
	): void {
		const peer = this.#sessions.get(session);
		if (peer === undefined || peer.state.status === RpcStateStatusEnum.closed) {
			return;
		}
		let closeEvent: Extract<
			RpcEvent,
			{ readonly type: RpcEventTypeEnum.peerClosed }
		>;
		// Continuity, protocol, and resource faults are reported as protocol failures.
		const isProtocolFailure =
			reason === RpcCloseReasonEnum.continuityFailure ||
			reason === RpcCloseReasonEnum.protocolFault ||
			reason === RpcCloseReasonEnum.resourceFault;
		// Recovery expiry and counter exhaustion are reported as unavailability.
		const isUnavailableFailure =
			reason === RpcCloseReasonEnum.recoveryExpired ||
			reason === RpcCloseReasonEnum.counterExhaustion;
		if (isUnavailableFailure) {
			peer.stageState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: createRpcException(RpcExceptionCodeEnum.unavailable, cause),
			});
			closeEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
			};
		} else if (isProtocolFailure) {
			peer.stageState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: createRpcException(RpcExceptionCodeEnum.protocol, cause),
			});
			closeEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
			};
		} else {
			peer.stageState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			});
			closeEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer,
				outcome: RpcCloseOutcomeEnum.normal,
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
		// Terminal owners ignore faults that can no longer affect live state.
		const ownerIsTerminal =
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed;
		if (ownerIsTerminal) {
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

		const faultError = createRpcException(RpcExceptionCodeEnum.protocol, error);
		const terminalPeers = [...this.#sessions.values()];
		const membershipChanged = this.#peers.length > 0;
		this.#sessions.clear();
		for (const peer of terminalPeers) {
			peer.stageState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: faultError,
			});
		}
		if (membershipChanged) {
			this.#stagePeers(Object.freeze([]));
		}
		this.#stageState(Object.freeze({ status: RpcStateStatusEnum.closing }));
		this.#flushState();
		if (membershipChanged) {
			this.#flushPeers();
		}
		for (const peer of terminalPeers) {
			peer.flushState();
		}
		for (const peer of terminalPeers) {
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerClosed,
				peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
			});
			peer.completeState();
		}
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerClosing });
		this.#startCleanup(
			Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: faultError,
			}),
		);
	}
}
