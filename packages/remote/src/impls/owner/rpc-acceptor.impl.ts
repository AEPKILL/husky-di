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
import type { IRpcAcceptorPublisher } from "@/interfaces/owner/rpc-owner-publisher.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerHost,
	RpcPeerFactory,
} from "@/interfaces/peer/rpc-peer-host.interface";
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
import type { RpcPeerStatePublication } from "@/types/owner/rpc-owner-publication.type";
import type {
	RpcPeerLifecycleFact,
	RpcSessionTerminalChange,
} from "@/types/owner/rpc-session-projection.type";
import type {
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/peer/remote-service-descriptor.type";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
import {
	isRpcSessionTerminalChange,
	resolveRpcSessionClosure,
	resolveRpcSessionTransition,
} from "@/utils/rpc-session-projection.util";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import {
	isCallable,
	isNonNullObject,
	isUndefined,
} from "@/utils/type-guard.util";

export type CreateRpcAcceptorImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly custody: IRpcOwnerCustody;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createPeer: RpcPeerFactory;
	readonly publisher: IRpcAcceptorPublisher;
	readonly protocol: IRpcProtocolAcceptor;
}>;

/** Owns Acceptor listener state and its current stable peer membership. */
export class RpcAcceptorImpl implements IRpcAcceptor {
	readonly #protocol: IRpcProtocolAcceptor;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #ownerExposures: RpcExposureRegistry = new Map();
	readonly #sessions = new Map<
		IRpcProtocolSession,
		RpcAcceptorPeerAssociation
	>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #custody: IRpcOwnerCustody;
	readonly #publisher: IRpcAcceptorPublisher;
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
			publisher,
			policy,
			retainedBytesLedger,
			protocol,
		} = options;
		this.#protocol = protocol;
		this.#policy = policy;
		this.#custody = custody;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#handlerScheduler = handlerScheduler;
		this.#publisher = publisher;
		this.#createPeer = createPeer;
		this.#ordinaryConnectionLimit =
			policy.maxSessions + 2 * policy.maxHandshakes;
		this.state$ = publisher.state$;
		this.peers$ = publisher.peers$;
		this.event$ = publisher.event$;
	}

	get state(): RpcAcceptorState {
		return this.#publisher.state;
	}

	#isOwnerDraining(): boolean {
		return this.#publisher.state.status === RpcStateStatusEnum.draining;
	}

	get peers(): readonly IRpcPeer[] {
		return this.#publisher.peers;
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
			(wireName) =>
				this.#ownerExposures.has(wireName) ||
				[...this.#sessions.values()].some(({ host }) =>
					host.hasLocalExposure(wireName),
				),
			(exposure) => {
				this.#ownerExposures.set(exposure.wireName, exposure);
				let active = true;
				return () => {
					if (
						active &&
						this.#ownerExposures.get(exposure.wireName) === exposure
					) {
						this.#ownerExposures.delete(exposure.wireName);
					}
					active = false;
				};
			},
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
		this.#publisher.enqueue(() => {
			if (
				this.state.status !== RpcStateStatusEnum.active ||
				this.#terminationTask !== undefined
			) {
				return undefined;
			}
			return {
				publication: {
					state: Object.freeze<RpcAcceptorState>({
						status: RpcStateStatusEnum.active as const,
						listener: Object.freeze(listener),
					}),
				},
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
		this.#publisher.enqueue(() => {
			if (this.state.status !== RpcStateStatusEnum.active) {
				return undefined;
			}
			const peerEvents: RpcEvent[] = [];
			const peerStates: RpcPeerStatePublication[] = [];
			const terminalPeers: IRpcPeer[] = [];
			const terminalSessions: IRpcProtocolSession[] = [];
			const terminalAssociations: RpcAcceptorPeerAssociation[] = [];
			for (const [session, association] of this.#sessions) {
				const peer = association.host.peer;
				if (peer.state.status === RpcStateStatusEnum.connected) {
					peerStates.push({
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
					peerStates.push({
						peer,
						state: {
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.normal,
							reason: RpcCloseReasonEnum.forcedClose,
						},
						terminal: true,
					});
					terminalSessions.push(session);
					terminalAssociations.push(association);
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
			const peers =
				terminalPeers.length === 0
					? undefined
					: this.#publisher.peers.filter((peer) => !terminalSet.has(peer));
			return {
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					peers,
					peerStates,
					events: [{ type: RpcEventTypeEnum.ownerDraining }, ...peerEvents],
				},
				apply: (commitSnapshots) => {
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
					for (const association of terminalAssociations) {
						this.#releaseSession(association);
					}
					commitSnapshots();
					this.#abortListener();
					return () => this.#continueGracefulShutdown();
				},
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
		this.#publisher.enqueue(() => {
			// Closing is idempotent once the owner is closing or closed.
			const terminationAlreadyStarted =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed;
			if (terminationAlreadyStarted) {
				return undefined;
			}
			const terminalAssociations = [...this.#sessions.values()];
			const terminalSessions = terminalAssociations.flatMap(({ sessionRef }) =>
				sessionRef.current === undefined ? [] : [sessionRef.current],
			);
			const peerClosures = this.#createRemainingPeerMutations(reason);
			const finalState = Object.freeze({
				status: RpcStateStatusEnum.closed as const,
				outcome: RpcCloseOutcomeEnum.normal as const,
				reason,
			});
			return {
				publication: {
					state: { status: RpcStateStatusEnum.closing },
					peers: peerClosures.peersChanged ? [] : undefined,
					peerStates: peerClosures.peerStates,
					events: [
						...peerClosures.events,
						{ type: RpcEventTypeEnum.ownerClosing },
					],
				},
				apply: (commitSnapshots) => {
					if (this.#graceTimer !== undefined) {
						clearTimeout(this.#graceTimer);
						this.#graceTimer = undefined;
					}
					for (const association of terminalAssociations) {
						this.#releaseSession(association);
					}
					commitSnapshots();
					this.#abortListener();
					if (forced) {
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
					}
					return () => this.#startCleanup(finalState);
				},
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
		readonly peerStates: readonly RpcPeerStatePublication[];
		readonly peersChanged: boolean;
	} {
		const closeEvents: RpcEvent[] = [];
		const peerStates: RpcPeerStatePublication[] = [];
		const peersChanged = this.#publisher.peers.length > 0;
		for (const { host } of this.#sessions.values()) {
			const peer = host.peer;
			// Counter-draining peers remain failed when graceful owner shutdown wins.
			const counterDrainFailedDuringShutdown =
				reason === RpcCloseReasonEnum.gracefulShutdown &&
				peer.state.status === RpcStateStatusEnum.draining &&
				peer.state.reason === RpcCloseReasonEnum.counterExhaustion;
			if (counterDrainFailedDuringShutdown) {
				peerStates.push({
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
				peerStates.push({
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
		return { events: closeEvents, peerStates, peersChanged };
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
		this.#publisher.finish(finalState, () => this.#resolveTermination?.());
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
		this.#publisher.finish(finalState, () => this.#rejectTermination?.(error));
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
			this.#publisher.processing ||
			this.#insideConnectionHandoff ||
			this.#insideOwnerFault ||
			this.#sessions.size >= this.#policy.maxSessions ||
			this.#sessions.has(session) ||
			!isProtocolSession(session);
		if (cannotAdmitSession) {
			return undefined;
		}

		let admitted: RpcAcceptorPeerAssociation | undefined;
		this.#publisher.enqueue(() => {
			const admissionBecameStale =
				this.state.status !== RpcStateStatusEnum.active ||
				this.#terminationTask !== undefined ||
				this.#insideOwnerFault ||
				this.#sessions.size >= this.#policy.maxSessions ||
				this.#sessions.has(session);
			if (admissionBecameStale) {
				return undefined;
			}
			const sessionRef: RpcAcceptorSessionRef = { current: undefined };
			const host = this.#publisher.registerPeer(
				{ status: RpcStateStatusEnum.connected },
				({ readState, state$ }) =>
					this.#createPeer({
						readState,
						state$,
						getSession: () => sessionRef.current,
						findOwnerExposure: (wireName) => this.#ownerExposures.get(wireName),
						isOwnerActive: () =>
							this.#terminationTask === undefined &&
							this.state.status === RpcStateStatusEnum.active,
						callEventSink: this.#publisher.callEventSink,
						onProtocolFault: (error) => {
							const retainedSession = sessionRef.current;
							if (retainedSession !== undefined) {
								this.#faultSession(
									retainedSession,
									RpcCloseReasonEnum.protocolFault,
									error,
								);
							}
						},
						handlerScheduler: this.#handlerScheduler,
						maximumIncomingBytes: Math.floor(
							this.#policy.maxRetainedBytesPerSession / 4,
						),
						reserveRetainedBytes: (bytes) =>
							reserveRpcSessionRetainedBytes(
								sessionRef.current,
								(ownerBytes) => this.reserveRetainedBytes(ownerBytes),
								bytes,
							),
					}),
			);
			const association: RpcAcceptorPeerAssociation = { host, sessionRef };
			const peer = host.peer;
			return {
				publication: {
					peers: [...this.#publisher.peers, peer],
					events: [{ type: RpcEventTypeEnum.peerOpened, peer }],
				},
				apply: (commitSnapshots) => {
					sessionRef.current = session;
					this.#sessions.set(session, association);
					admitted = association;
					commitSnapshots();
					return undefined;
				},
			};
		});
		if (admitted === undefined) {
			return undefined;
		}
		const association = admitted;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request, consume) =>
				association.host.reserveIncomingCall(request, consume),
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
			resolveRpcSessionClosure(reason, error),
			forceSessionClosed,
			releaseFaultFence,
		);
	}

	#transitionSession(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		this.#publisher.enqueue(() => {
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
			const association = this.#sessions.get(session);
			if (association === undefined) {
				this.#faultSession(
					session,
					RpcCloseReasonEnum.protocolFault,
					new Error("Protocol repeated a terminal Session transition."),
				);
				return undefined;
			}
			const peer = association.host.peer;
			const decision = resolveRpcSessionTransition(
				this.state.status,
				peer.state,
				transition,
			);
			if (decision.kind === "fault") {
				this.#faultSession(session, decision.reason, decision.error);
				return undefined;
			}
			if (isRpcSessionTerminalChange(decision)) {
				this.#closePeerFromSession(session, decision);
				return undefined;
			}
			return {
				publication: {
					peerStates: [{ peer, state: decision.state }],
					events: [this.#createPeerLifecycleEvent(peer, decision.lifecycle)],
				},
			};
		});
	}

	#closePeerFromSession(
		session: IRpcProtocolSession,
		change: RpcSessionTerminalChange,
		beforeSnapshots?: () => void,
		continueAfterClose?: () => void,
	): void {
		this.#publisher.enqueue(() => {
			const association = this.#sessions.get(session);
			if (
				association === undefined ||
				association.host.peer.state.status === RpcStateStatusEnum.closed
			) {
				if (beforeSnapshots === undefined && continueAfterClose === undefined) {
					return undefined;
				}
				return {
					publication: {},
					apply: (commitSnapshots) => {
						beforeSnapshots?.();
						commitSnapshots();
						return continueAfterClose;
					},
				};
			}
			const peer = association.host.peer;
			return {
				publication: {
					peers: this.#publisher.peers.filter(
						(candidate) => candidate !== peer,
					),
					peerStates: [{ peer, state: change.state, terminal: true }],
					events: [this.#createPeerLifecycleEvent(peer, change.lifecycle)],
				},
				apply: (commitSnapshots) => {
					beforeSnapshots?.();
					this.#releaseSession(association);
					commitSnapshots();
					return continueAfterClose;
				},
			};
		});
	}

	#createPeerLifecycleEvent(
		peer: IRpcPeer,
		lifecycle: RpcPeerLifecycleFact,
	): RpcEvent {
		return { ...lifecycle, peer };
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
		this.#publisher.enqueue(() => {
			const faultBecameStale =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed;
			if (faultBecameStale) {
				releaseFaultFence();
				return undefined;
			}
			const terminalAssociations = [...this.#sessions.values()];
			const terminalSessions = terminalAssociations.flatMap(({ sessionRef }) =>
				sessionRef.current === undefined ? [] : [sessionRef.current],
			);
			const terminalPeers = terminalAssociations.map(({ host }) => host.peer);
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
				publication: {
					state: { status: RpcStateStatusEnum.closing },
					peers: this.#publisher.peers.length > 0 ? [] : undefined,
					peerStates: terminalPeers.map((peer) => ({
						peer,
						state: {
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.failed,
							reason,
							error: faultError,
						},
						terminal: true,
					})),
					events: [
						...terminalPeers.map((peer) => ({
							type: RpcEventTypeEnum.peerClosed as const,
							peer,
							outcome: RpcCloseOutcomeEnum.failed as const,
							reason,
						})),
						{ type: RpcEventTypeEnum.ownerClosing },
					],
				},
				apply: (commitSnapshots) => {
					if (this.#graceTimer !== undefined) {
						clearTimeout(this.#graceTimer);
						this.#graceTimer = undefined;
					}
					this.#abortListener();
					try {
						this.#protocol.close();
					} catch {
						// The original shared Protocol fault remains authoritative.
					}
					for (const association of terminalAssociations) {
						this.#releaseSession(association);
					}
					commitSnapshots();
					return () => {
						try {
							this.#startCleanup(finalState);
						} finally {
							releaseFaultFence();
						}
					};
				},
			};
		});
	}

	#releaseSession(association: RpcAcceptorPeerAssociation): void {
		const session = association.sessionRef.current;
		if (session !== undefined && this.#sessions.get(session) === association) {
			this.#sessions.delete(session);
		}
		association.sessionRef.current = undefined;
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

interface RpcAcceptorPeerAssociation {
	readonly host: IRpcPeerHost;
	readonly sessionRef: RpcAcceptorSessionRef;
}

interface RpcAcceptorSessionRef {
	current: IRpcProtocolSession | undefined;
}

type RpcAcceptorClosedState = Extract<
	RpcAcceptorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

function isProtocolSession(value: unknown): value is IRpcProtocolSession {
	if (!isNonNullObject(value)) {
		return false;
	}
	const session = value as object;
	return (
		isCallable(Reflect.get(session, "prepareInvocation")) &&
		isCallable(Reflect.get(session, "forceClose"))
	);
}
