/**
 * @overview RPC Acceptor Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import type { Observable, Subscription } from "rxjs";
import { RpcAcceptorListenerStopReasonEnum } from "@/enums/rpc-acceptor-listener-stop-reason.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcAcceptor } from "@/interfaces/owner/rpc-acceptor.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type {
	IRpcOwnerCustody,
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcOwnerMutationBatch } from "@/interfaces/owner/rpc-owner-mutation-batch.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerRuntime,
	RpcPeerFactory,
} from "@/interfaces/peer/rpc-peer-runtime.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type {
	RpcAcceptorListenerState,
	RpcAcceptorState,
} from "@/types/common/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/common/rpc-exposure.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type { CreateRpcAcceptorImplOptions } from "@/types/owner/rpc-owner.type";
import type { RpcOwnerPeerMutation } from "@/types/owner/rpc-owner-mutation-batch.type";
import type {
	RpcSessionClosureProjectionIntent,
	RpcSessionTerminalProjection,
} from "@/types/owner/rpc-session-projection.type";
import type {
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/peer/remote-service-descriptor.type";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
import {
	isRpcSessionTerminalProjection,
	projectRpcSession,
} from "@/utils/rpc-session-projection.util";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import {
	isCallable,
	isNonNullObject,
	isUndefined,
} from "@/utils/type-guard.util";

/** Owns Acceptor listener state and its current stable peer membership. */
export class RpcAcceptorImpl implements IRpcAcceptor {
	readonly #protocol: IRpcProtocolAcceptor;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #ownerExposureRegistry: RpcExposureRegistry = new Map();
	readonly #sessions = new Map<IRpcProtocolSession, IRpcPeerRuntime>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #custody: IRpcOwnerCustody;
	readonly #mutationBatch: IRpcOwnerMutationBatch<RpcAcceptorState>;
	readonly #createPeer: RpcPeerFactory;
	readonly #ordinaryConnectionLimit: number;
	#overflowConnection: RpcOwnedConnection | undefined;
	#listenerCleanupBarrier: Promise<void> | undefined;
	#listenerAttempt: RpcAcceptorListenerAttempt | undefined;
	#insideConnectionHandoff = false;
	#insideOwnerFault = false;
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
			mutationBatch,
			policy,
			retainedBytesLedger,
			protocol,
		} = options;
		this.#protocol = protocol;
		this.#policy = policy;
		this.#custody = custody;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#handlerScheduler = handlerScheduler;
		this.#mutationBatch = mutationBatch;
		this.#createPeer = createPeer;
		this.#ordinaryConnectionLimit =
			policy.maxSessions + 2 * policy.maxHandshakes;
		this.state$ = mutationBatch.state$;
		this.peers$ = mutationBatch.membership$;
		this.event$ = mutationBatch.event$;
	}

	get state(): RpcAcceptorState {
		return this.#mutationBatch.state;
	}

	#isOwnerDraining(): boolean {
		return this.#mutationBatch.state.status === RpcStateStatusEnum.draining;
	}

	get peers(): readonly IRpcPeer[] {
		return this.#mutationBatch.membership;
	}

	/** Package-private Protocol retained-byte reservation port. */
	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this.#retainedBytesLedger.reserve(bytes);
	}

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: RemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		if (
			this.state.status !== RpcStateStatusEnum.active ||
			this.#terminationTask !== undefined
		) {
			throw createRpcException(RpcExceptionCodeEnum.unavailable);
		}
		return installRpcExposure(
			descriptor,
			implementation,
			this.#ownerExposureRegistry,
			this.#mutationBatch.membership.map((peer) => peer.localExposureRegistry),
		);
	}

	listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		return Promise.try(() => this.#listen(adapter));
	}

	#listen(adapter: IRpcAcceptorAdapter): Promise<void> {
		// Listening starts only from an idle owner with no prior listener resources.
		const listenerIsUnavailable =
			this.state.status !== RpcStateStatusEnum.active ||
			this.#terminationTask !== undefined ||
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
		if (attempt.terminal || this.#listenerAttempt !== attempt) {
			return startup;
		}

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
		this.#mutationBatch.mutate(() => {
			if (
				this.state.status !== RpcStateStatusEnum.active ||
				this.#terminationTask !== undefined
			) {
				return undefined;
			}
			return {
				ownerState: Object.freeze<RpcAcceptorState>({
					status: RpcStateStatusEnum.active as const,
					listener: Object.freeze(listener),
				}),
			};
		});
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
			this.#terminationTask !== undefined ||
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
				this.#protocol.accept(
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
		this.#mutationBatch.mutate(() => {
			if (this.state.status !== RpcStateStatusEnum.active) {
				return undefined;
			}
			const peerEvents: RpcEvent[] = [];
			const peerMutations: RpcOwnerPeerMutation[] = [];
			const terminalPeers: IRpcPeerRuntime[] = [];
			const terminalSessions: IRpcProtocolSession[] = [];
			for (const [session, peer] of this.#sessions) {
				if (peer.state.status === RpcStateStatusEnum.connected) {
					peerMutations.push({
						peer,
						state: {
							status: RpcStateStatusEnum.draining,
							reason: RpcCloseReasonEnum.gracefulShutdown,
						},
					});
					peerEvents.push({
						type: RpcEventTypeEnum.peerDraining,
						peer,
						reason: RpcCloseReasonEnum.gracefulShutdown,
					});
				} else if (peer.state.status === RpcStateStatusEnum.recovering) {
					peerMutations.push({
						peer,
						state: {
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.normal,
							reason: RpcCloseReasonEnum.forcedClose,
						},
						terminal: true,
					});
					terminalSessions.push(session);
					terminalPeers.push(peer);
					peerEvents.push({
						type: RpcEventTypeEnum.peerClosed,
						peer,
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					});
				}
			}
			const terminalSet = new Set<IRpcPeer>(terminalPeers);
			const membership =
				terminalPeers.length === 0
					? undefined
					: this.#mutationBatch.membership.filter(
							(peer) => !terminalSet.has(peer),
						);
			return {
				ownerState: { status: RpcStateStatusEnum.draining },
				membership,
				peerMutations,
				beforeSnapshotCommit: () => {
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
				},
				commitFacts: () => {
					for (const session of terminalSessions) {
						this.#sessions.delete(session);
					}
				},
				afterSnapshotCommit: () => this.#abortListener(),
				events: [{ type: RpcEventTypeEnum.ownerDraining }, ...peerEvents],
				afterNotifications: () => this.#continueGracefulShutdown(),
			};
		});
	}

	#continueGracefulShutdown(): void {
		if (!this.#isOwnerDraining()) {
			return;
		}
		this.#graceTimer = setTimeout(
			() => this.#beginClosing(RpcCloseReasonEnum.shutdownDeadline, true),
			this.#policy.shutdownDeadlineMs,
		);

		let grace: Promise<unknown>;
		try {
			grace = Promise.resolve(this.#protocol.shutdown());
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
		this.#mutationBatch.mutate(() => {
			// Closing is idempotent once the owner is closing or closed.
			const terminationAlreadyStarted =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed;
			if (terminationAlreadyStarted) {
				return undefined;
			}
			if (this.#graceTimer !== undefined) {
				clearTimeout(this.#graceTimer);
				this.#graceTimer = undefined;
			}
			const terminalSessions = [...this.#sessions.keys()];
			const peerClosures = this.#createRemainingPeerMutations(reason);
			return {
				ownerState: { status: RpcStateStatusEnum.closing },
				membership: peerClosures.membershipChanged ? [] : undefined,
				peerMutations: peerClosures.peerMutations,
				commitFacts: () => this.#sessions.clear(),
				afterSnapshotCommit: () => {
					this.#abortListener();
					if (!forced) {
						return;
					}
					for (const session of terminalSessions) {
						this.#faultingSessions.add(session);
					}
					try {
						this.#protocol.close();
					} catch {
						// Only cleanup failure rejects the shared termination task.
					} finally {
						for (const session of terminalSessions) {
							this.#faultingSessions.delete(session);
						}
					}
				},
				events: [
					...peerClosures.events,
					{ type: RpcEventTypeEnum.ownerClosing },
				],
				afterNotifications: () =>
					this.#startCleanup(
						Object.freeze({
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.normal,
							reason,
						}),
					),
			};
		});
	}

	#createRemainingPeerMutations(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
	): {
		readonly events: readonly RpcEvent[];
		readonly peerMutations: readonly RpcOwnerPeerMutation[];
		readonly membershipChanged: boolean;
	} {
		const closeEvents: RpcEvent[] = [];
		const peerMutations: RpcOwnerPeerMutation[] = [];
		const membershipChanged = this.#mutationBatch.membership.length > 0;
		for (const peer of this.#sessions.values()) {
			// Counter-draining peers remain failed when graceful owner shutdown wins.
			const counterDrainFailedDuringShutdown =
				reason === RpcCloseReasonEnum.gracefulShutdown &&
				peer.state.status === RpcStateStatusEnum.draining &&
				peer.state.reason === RpcCloseReasonEnum.counterExhaustion;
			if (counterDrainFailedDuringShutdown) {
				peerMutations.push({
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.failed,
						reason: RpcCloseReasonEnum.counterExhaustion,
						error: createRpcException(RpcExceptionCodeEnum.unavailable),
					},
					terminal: true,
				});
				closeEvents.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.failed,
					reason: RpcCloseReasonEnum.counterExhaustion,
				});
			} else {
				peerMutations.push({
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.normal,
						reason,
					},
					terminal: true,
				});
				closeEvents.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				});
			}
		}
		return { events: closeEvents, peerMutations, membershipChanged };
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
		this.#clearCleanupReferences();
		if (finalState.outcome === RpcCloseOutcomeEnum.normal) {
			this.#mutationBatch.finish({
				ownerState: finalState,
				event: {
					type: RpcEventTypeEnum.topologyClosed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: finalState.reason,
				},
				afterCompletion: () => this.#resolveTermination?.(),
			});
		} else {
			this.#mutationBatch.finish({
				ownerState: finalState,
				event: {
					type: RpcEventTypeEnum.topologyClosed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason: finalState.reason,
				},
				afterCompletion: () => this.#resolveTermination?.(),
			});
		}
	}

	#finishCleanupFailure(value: unknown): void {
		if (this.state.status !== RpcStateStatusEnum.closing) {
			return;
		}
		const error =
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
		const finalState = Object.freeze<RpcAcceptorClosedState>({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.cleanupFailed,
			error,
		});
		this.#clearCleanupReferences();
		this.#mutationBatch.finish({
			ownerState: finalState,
			event: {
				type: RpcEventTypeEnum.topologyClosed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.cleanupFailed,
			},
			afterCompletion: () => this.#rejectTermination?.(error),
		});
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
			this.#terminationTask !== undefined ||
			this.#mutationBatch.busy ||
			this.#insideConnectionHandoff ||
			this.#insideOwnerFault ||
			this.#sessions.size >= this.#policy.maxSessions ||
			this.#sessions.has(session) ||
			!isProtocolSession(session);
		if (cannotAdmitSession) {
			return undefined;
		}

		const peer = this.#createPeer({
			initialState: { status: RpcStateStatusEnum.connected },
			ownerExposureRegistry: this.#ownerExposureRegistry,
			isOwnerActive: () =>
				this.#terminationTask === undefined &&
				this.state.status === RpcStateStatusEnum.active,
			emitEvent: (event) => this.#mutationBatch.emitCallEvent(event),
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
		let admitted = false;
		this.#mutationBatch.mutate(() => {
			const admissionBecameStale =
				this.state.status !== RpcStateStatusEnum.active ||
				this.#terminationTask !== undefined ||
				this.#insideOwnerFault ||
				this.#sessions.size >= this.#policy.maxSessions ||
				this.#sessions.has(session);
			if (admissionBecameStale) {
				return undefined;
			}
			return {
				membership: [...this.#mutationBatch.membership, peer],
				commitFacts: () => {
					peer.attachProtocolSession(session);
					this.#sessions.set(session, peer);
					admitted = true;
				},
				events: [{ type: RpcEventTypeEnum.peerOpened, peer }],
			};
		});
		if (!admitted) {
			return undefined;
		}
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
		const releaseFaultFence = (): void => {
			this.#faultingSessions.delete(session);
		};
		const forceSessionClosed = (): void => {
			try {
				session.forceClose();
			} catch {
				// The original Session fault remains authoritative.
			}
		};
		this.#closePeerFromSession(
			session,
			{ kind: "closure", reason, cause: error },
			forceSessionClosed,
			releaseFaultFence,
		);
	}

	#transitionSession(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		this.#mutationBatch.mutate(() => {
			if (this.#insideOwnerFault || this.#faultingSessions.has(session)) {
				return undefined;
			}
			// Terminal owners ignore all later Session transitions.
			const ownerIsTerminal =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed;
			if (ownerIsTerminal) {
				return undefined;
			}
			const peer = this.#sessions.get(session);
			if (peer === undefined) {
				this.#faultSession(
					session,
					RpcCloseReasonEnum.protocolFault,
					new Error("Protocol repeated a terminal Session transition."),
				);
				return undefined;
			}
			const projection = projectRpcSession(peer, {
				kind: "transition",
				ownerStatus: this.state.status,
				transition,
			});
			if (projection.kind === "invalid") {
				this.#faultSession(
					session,
					projection.fault.reason,
					projection.fault.error,
				);
				return undefined;
			}
			if (isRpcSessionTerminalProjection(projection)) {
				this.#closePeerFromSession(session, projection);
				return undefined;
			}
			return {
				peerMutations: [projection.peerMutation],
				events: [projection.event],
			};
		});
	}

	#closePeerFromSession(
		session: IRpcProtocolSession,
		closure: RpcAcceptorSessionClosure,
		beforeSnapshotCommit?: () => void,
		afterNotifications?: () => void,
	): void {
		this.#mutationBatch.mutate(() => {
			const peer = this.#sessions.get(session);
			if (
				peer === undefined ||
				peer.state.status === RpcStateStatusEnum.closed
			) {
				if (
					beforeSnapshotCommit === undefined &&
					afterNotifications === undefined
				) {
					return undefined;
				}
				return { beforeSnapshotCommit, afterNotifications };
			}
			const projection =
				closure.kind === "closure" ? projectRpcSession(peer, closure) : closure;
			if (projection.peerMutation.peer !== peer) {
				throw new Error(
					"Session closure projection targeted an unexpected Peer.",
				);
			}
			return {
				membership: this.#mutationBatch.membership.filter(
					(candidate) => candidate !== peer,
				),
				peerMutations: [projection.peerMutation],
				beforeSnapshotCommit,
				commitFacts: () => this.#sessions.delete(session),
				events: [projection.event],
				afterNotifications,
			};
		});
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		// Terminal owners ignore faults that can no longer affect live state.
		const ownerIsTerminal =
			this.#insideOwnerFault ||
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed;
		if (ownerIsTerminal) {
			return;
		}
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		const faultError = createRpcException(RpcExceptionCodeEnum.protocol, error);
		const fencedSessions = new Set(this.#sessions.keys());
		for (const session of fencedSessions) {
			this.#faultingSessions.add(session);
		}
		this.#insideOwnerFault = true;
		const releaseFaultFence = (): void => {
			this.#insideOwnerFault = false;
			for (const session of fencedSessions) {
				this.#faultingSessions.delete(session);
			}
		};
		this.#mutationBatch.mutate(() => {
			const faultBecameStale =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed;
			if (faultBecameStale) {
				releaseFaultFence();
				return undefined;
			}
			if (this.#graceTimer !== undefined) {
				clearTimeout(this.#graceTimer);
				this.#graceTimer = undefined;
			}
			const terminalSessions = [...this.#sessions.keys()];
			const terminalPeers = [...this.#sessions.values()];
			for (const session of terminalSessions) {
				fencedSessions.add(session);
				this.#faultingSessions.add(session);
			}
			const finalState = Object.freeze<RpcAcceptorClosedState>({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: faultError,
			});
			return {
				ownerState: { status: RpcStateStatusEnum.closing },
				membership: this.#mutationBatch.membership.length > 0 ? [] : undefined,
				peerMutations: terminalPeers.map((peer) => ({
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.failed,
						reason,
						error: faultError,
					},
					terminal: true,
				})),
				beforeSnapshotCommit: () => {
					this.#abortListener();
					try {
						this.#protocol.close();
					} catch {
						// The original shared Protocol fault remains authoritative.
					}
				},
				commitFacts: () => this.#sessions.clear(),
				events: [
					...terminalPeers.map((peer) => ({
						type: RpcEventTypeEnum.peerClosed as const,
						peer,
						outcome: RpcCloseOutcomeEnum.failed as const,
						reason,
					})),
					{ type: RpcEventTypeEnum.ownerClosing },
				],
				afterNotifications: () => {
					try {
						this.#startCleanup(finalState);
					} finally {
						releaseFaultFence();
					}
				},
			};
		});
	}
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

type RpcAcceptorSessionClosure =
	| RpcSessionTerminalProjection
	| RpcSessionClosureProjectionIntent;

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
