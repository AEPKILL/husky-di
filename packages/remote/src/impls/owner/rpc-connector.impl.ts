/**
 * @overview RPC Connector Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable, Subscription } from "rxjs";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { CreateRpcPeerOptions } from "@/factories/rpc-peer.factory";
import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type {
	IRpcOwnerCustody,
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcConnectorPublisher } from "@/interfaces/owner/rpc-owner-publisher.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type { IRpcPeerHost } from "@/interfaces/peer/rpc-peer-host.interface";
import type {
	IRpcProtocolConnector,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import {
	type RpcConnectorConnectOptions,
	type RpcConnectorState,
	type RpcPeerState,
	rpcConnectorAdapterMembersSchema,
	rpcConnectorCallableSchema,
	rpcConnectorConnectOptionsSchema,
	rpcConnectorObservableSchema,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type { RpcConnectorCommit } from "@/types/owner/rpc-owner-publication.type";
import type {
	RpcPeerLifecycleFact,
	RpcSessionTerminalChange,
} from "@/types/owner/rpc-session-projection.type";
import { installRpcAbortListener } from "@/utils/rpc-cancellation.util";
import {
	isRpcSessionTerminalChange,
	resolveRpcSessionClosure,
	resolveRpcSessionTransition,
} from "@/utils/rpc-session-projection.util";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

export type CreateRpcConnectorImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly custody: IRpcOwnerCustody;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createPeer: (options: CreateRpcPeerOptions) => IRpcPeerHost;
	readonly publisher: IRpcConnectorPublisher;
	readonly protocol: IRpcProtocolConnector;
}>;

/** Owns one stable Connector peer and one owner-scoped Protocol role. */
export class RpcConnectorImpl implements IRpcConnector {
	readonly #protocol: IRpcProtocolConnector;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #publisher: IRpcConnectorPublisher;
	readonly #peerHost: IRpcPeerHost;
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #custody: IRpcOwnerCustody;
	readonly #connectionLimit: number;
	#attempt: RpcConnectorAttempt | undefined;
	#session: IRpcProtocolSession | undefined;
	#insideOwnerFault = false;
	#terminationRequested = false;
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;
	#rejectTermination: ((error: unknown) => void) | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeer;

	constructor(options: CreateRpcConnectorImplOptions) {
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
		this.#publisher = publisher;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#connectionLimit = policy.maxSessions + 2 * policy.maxHandshakes;
		this.state$ = publisher.state$;
		this.event$ = publisher.event$;
		this.#peerHost = publisher.registerPeer(
			{ status: RpcStateStatusEnum.unbound },
			({ readState, state$ }) =>
				createPeer({
					readState,
					state$,
					getSession: () => this.#session,
					findOwnerExposure: () => undefined,
					isOwnerActive: () =>
						!this.#terminationRequested &&
						this.state.status === RpcStateStatusEnum.active,
					callEventSink: publisher.callEventSink,
					onProtocolFault: (error) =>
						this.protocolFault(RpcCloseReasonEnum.protocolFault, error),
					handlerScheduler,
					maximumIncomingBytes: Math.floor(
						policy.maxRetainedBytesPerSession / 4,
					),
					reserveRetainedBytes: (bytes) =>
						reserveRpcSessionRetainedBytes(
							this.#session ?? this.#attempt?.provisionalSession,
							(ownerBytes) => this.reserveRetainedBytes(ownerBytes),
							bytes,
						),
				}),
		);
		this.peer = this.#peerHost.peer;
	}

	get state(): RpcConnectorState {
		return this.#publisher.state;
	}

	#isOwnerDraining(): boolean {
		return this.#publisher.state.status === RpcStateStatusEnum.draining;
	}

	/** Package-private Protocol retained-byte reservation port. */
	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this.#retainedBytesLedger.reserve(bytes);
	}

	connect(options: RpcConnectorConnectOptions): Promise<void> {
		return Promise.try(() => this.#connect(options));
	}

	#connect(options: RpcConnectorConnectOptions): Promise<void> {
		// A connection attempt requires an active owner, an eligible peer, and free capacity.
		const connectorIsUnavailable =
			this.#terminationRequested ||
			this.state.status !== RpcStateStatusEnum.active ||
			(this.peer.state.status !== RpcStateStatusEnum.unbound &&
				this.peer.state.status !== RpcStateStatusEnum.recovering) ||
			this.#attempt !== undefined ||
			this.#custody.connectionCount >= this.#connectionLimit;
		if (connectorIsUnavailable) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const optionsResult = rpcConnectorConnectOptionsSchema.safeParse(options);
		if (!optionsResult.success) {
			throw new TypeError(optionsResult.error.message, {
				cause: optionsResult.error,
			});
		}
		const optionRecord = optionsResult.data;
		const signal = optionRecord.signal?.signal;
		if (optionRecord.signal?.aborted === true) {
			return Promise.reject(
				new DOMException("The connection attempt was aborted.", "AbortError"),
			);
		}
		const adapterResult = rpcConnectorAdapterMembersSchema.safeParse(
			optionRecord.adapter,
		);
		if (!adapterResult.success) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}
		const { connect, connection$ } = adapterResult.data;
		const connectionSourceIsInvalid =
			!rpcConnectorObservableSchema.safeParse(connection$).success;
		const connectIsInvalid =
			!rpcConnectorCallableSchema.safeParse(connect).success;
		if (connectionSourceIsInvalid || connectIsInvalid) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}
		const adapter = optionRecord.adapter as IRpcConnectorAdapter;
		const validConnectionSource = connection$ as Observable<IRpcConnection>;
		const validConnect = connect as IRpcConnectorAdapter["connect"];

		const fresh = this.peer.state.status === RpcStateStatusEnum.unbound;
		let attempt!: RpcConnectorAttempt;
		let attemptInitialized = false;
		let admissionError: Error | undefined;
		this.#publisher.enqueue(() => {
			const expectedPeerStatus = fresh
				? RpcStateStatusEnum.unbound
				: RpcStateStatusEnum.recovering;
			const admissionBecameStale =
				this.#terminationRequested ||
				this.state.status !== RpcStateStatusEnum.active ||
				this.peer.state.status !== expectedPeerStatus ||
				(attemptInitialized && this.#attempt !== attempt);
			if (admissionBecameStale) {
				admissionError = createRpcException(RpcExceptionCodeEnum.unavailable);
				if (attemptInitialized) {
					this.#finishFailedAttempt(attempt, fresh, admissionError);
				}
				return undefined;
			}
			if (!fresh) {
				return undefined;
			}
			return {
				publication: {
					peerStates: [
						{
							peer: this.peer,
							state: { status: RpcStateStatusEnum.connecting },
						},
					],
				},
			};
		});
		if (admissionError !== undefined || this.#terminationRequested) {
			return Promise.reject(
				admissionError ?? createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const { promise: ownerAbort, reject: rejectOwnerAbort } =
			Promise.withResolvers<never>();
		void ownerAbort.catch(() => {});
		const {
			promise: adapterStartup,
			resolve: resolveAdapterStartup,
			reject: rejectAdapterStartup,
		} = Promise.withResolvers<void>();
		const startupCleanupTask = adapterStartup.then(
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
		);
		void startupCleanupTask.catch(() => {});
		const startupCleanup = this.#custody.ownCleanup(() => startupCleanupTask);
		attempt = {
			abortController: new AbortController(),
			ownerAbort,
			rejectOwnerAbort,
			startupCleanup,
			insideHandoff: false,
			attached: false,
			cleanupRequested: false,
			fenced: false,
		};
		attemptInitialized = true;
		this.#attempt = attempt;

		const {
			promise: sourceTerminal,
			resolve: resolveSource,
			reject: rejectSource,
		} = Promise.withResolvers<void>();
		const {
			promise: binding,
			resolve: resolveBinding,
			reject: rejectBinding,
		} = Promise.withResolvers<void>();

		try {
			attempt.subscription = validConnectionSource.subscribe({
				next: (connection) => {
					const ownedConnection = this.#custody.ownConnection(connection);
					if (
						this.#terminationRequested ||
						attempt.fenced ||
						this.#attempt !== attempt
					) {
						ownedConnection.directClose();
						return;
					}
					if (attempt.connection !== undefined) {
						ownedConnection.directClose();
						rejectBinding(
							new Error("Connector Adapter emitted multiple Connections."),
						);
						return;
					}
					attempt.connection = ownedConnection;
					attempt.insideHandoff = true;
					try {
						const result = this.#protocol.bind(
							ownedConnection.connection,
							attempt.abortController.signal,
						);
						Promise.resolve(result).then(resolveBinding, rejectBinding);
					} catch (error) {
						rejectBinding(error);
					} finally {
						attempt.insideHandoff = false;
					}
				},
				error: rejectSource,
				complete: () => {
					if (attempt.connection === undefined) {
						rejectBinding(
							new Error("Connector Adapter completed without a Connection."),
						);
					}
					resolveSource();
				},
			});
		} catch (error) {
			resolveAdapterStartup();
			this.#finishFailedAttempt(attempt, fresh);
			return Promise.reject(error);
		}

		try {
			Promise.resolve(
				Reflect.apply(validConnect, adapter, [attempt.abortController.signal]),
			).then(resolveAdapterStartup, rejectAdapterStartup);
		} catch (error) {
			rejectAdapterStartup(error);
		}
		if (signal !== undefined) {
			attempt.removeExternalAbortListener = installRpcAbortListener(
				signal as AbortSignal,
				() => {
					this.#finishFailedAttempt(
						attempt,
						fresh,
						new DOMException(
							"The connection attempt was aborted.",
							"AbortError",
						),
					);
				},
			);
		}

		return Promise.race([
			Promise.all([adapterStartup, sourceTerminal, binding]),
			attempt.ownerAbort,
		])
			.then(() => {
				attempt.removeExternalAbortListener?.();
				attempt.removeExternalAbortListener = undefined;
				if (attempt.connection === undefined) {
					throw new Error("Protocol did not attach a Connector Session.");
				}
				if (fresh) {
					const session = attempt.provisionalSession;
					let freshSessionCommitted = false;
					this.#publisher.enqueue(() => {
						// Fresh startup commits only the live attempt's valid provisional Session.
						const freshSessionCannotCommit =
							this.#terminationRequested ||
							session === undefined ||
							attempt.fenced ||
							this.#attempt !== attempt ||
							this.state.status !== RpcStateStatusEnum.active ||
							this.peer.state.status !== RpcStateStatusEnum.connecting;
						if (freshSessionCannotCommit) {
							return undefined;
						}
						return {
							publication: {
								peerStates: [
									{
										peer: this.peer,
										state: { status: RpcStateStatusEnum.connected },
									},
								],
							},
							apply: (commitSnapshots) => {
								attempt.provisionalSession = undefined;
								this.#session = session;
								freshSessionCommitted = true;
								commitSnapshots();
								return undefined;
							},
						};
					});
					if (session === undefined || !freshSessionCommitted) {
						throw new Error("Protocol did not attach a Connector Session.");
					}
					if (attempt.ownerAbortError !== undefined) {
						throw attempt.ownerAbortError;
					}
					// Startup can publish success only while the Connector and Peer remain active.
					const startupBecameStale =
						this.#terminationRequested ||
						this.state.status !== RpcStateStatusEnum.active ||
						this.#session !== session ||
						!this.#isPeerConnected();
					if (startupBecameStale) {
						throw new Error(
							"Connector terminated before startup could settle.",
						);
					}
					this.#publisher.enqueue(() => {
						const openedEventBecameStale =
							this.#terminationRequested ||
							this.state.status !== RpcStateStatusEnum.active ||
							this.#session !== session ||
							!this.#isPeerConnected();
						if (openedEventBecameStale) {
							return undefined;
						}
						return {
							publication: {
								events: [
									{
										type: RpcEventTypeEnum.peerOpened,
										peer: this.peer,
									},
								],
							},
						};
					});
					return;
				}
				// Resume startup must leave the retained Session connected.
				const resumedSessionIsMissing =
					this.#terminationRequested ||
					this.state.status !== RpcStateStatusEnum.active ||
					this.#attempt !== attempt ||
					this.#session === undefined ||
					this.peer.state.status !== RpcStateStatusEnum.connected;
				if (resumedSessionIsMissing) {
					throw new Error("Protocol did not attach a Connector Session.");
				}
			})
			.catch((error: unknown) => {
				this.#finishFailedAttempt(attempt, fresh);
				if (attempt.ownerAbortError !== undefined) {
					throw attempt.ownerAbortError;
				}
				throw createRpcException(
					RpcExceptionCodeEnum.unavailable,
					error instanceof Error ? error : undefined,
				);
			})
			.finally(() => {
				attempt.removeExternalAbortListener?.();
				attempt.subscription?.unsubscribe();
				attempt.startupCleanup.start();
				if (this.#attempt === attempt) {
					this.#attempt = undefined;
				}
			});
	}

	#isPeerConnected(): boolean {
		return this.peer.state.status === RpcStateStatusEnum.connected;
	}

	#finishFailedAttempt(
		attempt: RpcConnectorAttempt,
		fresh: boolean,
		ownerAbort?: Error,
	): void {
		if (!attempt.fenced) {
			attempt.fenced = true;
			attempt.subscription?.unsubscribe();
			if (ownerAbort !== undefined) {
				attempt.cleanupRequested = true;
				attempt.ownerAbortError = ownerAbort;
				attempt.rejectOwnerAbort(attempt.ownerAbortError);
			}
			attempt.abortController.abort();
		}
		const provisionalSession = attempt.provisionalSession;
		attempt.provisionalSession = undefined;
		if (provisionalSession !== undefined) {
			try {
				provisionalSession.forceClose();
			} catch {
				// The startup failure remains authoritative.
			}
		}
		if (attempt.connection !== undefined) {
			attempt.connection.directClose();
		}
		if (fresh) {
			this.#publisher.enqueue(() => {
				const fallbackBecameStale =
					this.#terminationRequested ||
					this.state.status !== RpcStateStatusEnum.active ||
					this.#attempt !== attempt ||
					this.#session !== undefined ||
					this.peer.state.status !== RpcStateStatusEnum.connecting;
				if (fallbackBecameStale) {
					return undefined;
				}
				return {
					publication: {
						peerStates: [
							{
								peer: this.peer,
								state: { status: RpcStateStatusEnum.unbound },
							},
						],
					},
				};
			});
		}
	}

	/** Package-private Protocol attachment port. */
	attachSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		const attempt = this.#attempt;
		// Attachment is single-use and belongs to the live pre-handoff attempt.
		const cannotAttachSession =
			this.#terminationRequested ||
			attempt === undefined ||
			attempt.fenced ||
			attempt.insideHandoff ||
			attempt.attached ||
			this.#session !== undefined ||
			!isProtocolSession(session);
		if (cannotAttachSession) {
			return undefined;
		}

		attempt.attached = true;
		attempt.provisionalSession = session;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request, consume) =>
				this.#peerHost.reserveIncomingCall(request, consume),
			transition: (transition) => this.#transitionSession(session, transition),
			fault: (reason, error) => this.#faultSession(session, reason, error),
		});
	}

	#faultSession(
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		const attempt = this.#attempt;
		const provisional = attempt?.provisionalSession === session;
		// Ignore faults from Sessions no longer owned or already being faulted.
		const sessionFaultIsStale =
			(this.#session !== session && !provisional) ||
			this.peer.state.status === RpcStateStatusEnum.closed ||
			this.#faultingSessions.has(session);
		if (sessionFaultIsStale) {
			return;
		}
		this.#faultingSessions.add(session);
		if (provisional && attempt !== undefined) {
			try {
				this.#finishFailedAttempt(
					attempt,
					true,
					createRpcException(RpcExceptionCodeEnum.protocol, error),
				);
			} finally {
				this.#faultingSessions.delete(session);
			}
			return;
		}
		if (this.#session === session) {
			this.#closeFromSession(
				reason,
				error,
				() => {
					try {
						session.forceClose();
					} catch {
						// The original Session fault remains authoritative.
					}
				},
				() => this.#faultingSessions.delete(session),
				session,
			);
		} else {
			this.#faultingSessions.delete(session);
		}
	}

	#transitionSession(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		const transitionCurrentlyOwnsSession =
			!this.#faultingSessions.has(session) &&
			this.#session === session &&
			this.peer.state.status !== RpcStateStatusEnum.closed;
		const transitionCurrentlyRequestsClosure =
			transitionCurrentlyOwnsSession &&
			transition.type === RpcProtocolSessionTransitionTypeEnum.closed;
		if (
			transitionCurrentlyRequestsClosure &&
			this.#terminationTask === undefined
		) {
			this.#createTerminationTask();
		}
		this.#publisher.enqueue(() => {
			if (this.#faultingSessions.has(session)) {
				return undefined;
			}
			// Ignore transitions from a replaced Session or after Peer termination.
			const transitionIsStale =
				this.#session !== session ||
				this.peer.state.status === RpcStateStatusEnum.closed;
			if (transitionIsStale) {
				return undefined;
			}
			const decision = resolveRpcSessionTransition(
				this.state.status,
				this.peer.state,
				transition,
			);
			if (decision.kind === "fault") {
				this.#faultSession(session, decision.reason, decision.error);
				return undefined;
			}
			if (isRpcSessionTerminalChange(decision)) {
				return this.#createSessionCloseCommit(decision);
			}
			return {
				publication: {
					peerStates: [{ peer: this.peer, state: decision.state }],
					events: [this.#createPeerLifecycleEvent(decision.lifecycle)],
				},
			};
		});
	}

	#closeFromSession(
		reason: RpcSessionCloseReason,
		cause?: Error,
		beforeSnapshots?: () => void,
		continueAfterClose?: () => void,
		expectedSession?: IRpcProtocolSession,
	): void {
		const closureIsAlreadyStale =
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed ||
			(expectedSession !== undefined && this.#session !== expectedSession);
		if (closureIsAlreadyStale) {
			continueAfterClose?.();
			return;
		}
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		this.#publisher.enqueue(() => {
			// Session closure is idempotent once owner termination starts.
			const terminationAlreadyStarted =
				this.state.status === RpcStateStatusEnum.closing ||
				this.state.status === RpcStateStatusEnum.closed ||
				(expectedSession !== undefined && this.#session !== expectedSession);
			if (terminationAlreadyStarted) {
				if (continueAfterClose === undefined) {
					return undefined;
				}
				return {
					publication: {},
					apply: (commitSnapshots) => {
						commitSnapshots();
						return continueAfterClose;
					},
				};
			}
			const change = resolveRpcSessionClosure(reason, cause);
			return this.#createSessionCloseCommit(
				change,
				beforeSnapshots,
				continueAfterClose,
			);
		});
	}

	#createSessionCloseCommit(
		change: RpcSessionTerminalChange,
		beforeSnapshots?: () => void,
		continueAfterClose?: () => void,
	): RpcConnectorCommit {
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		const finalState = change.state;
		return {
			publication: {
				state: { status: RpcStateStatusEnum.closing },
				peerStates: [{ peer: this.peer, state: finalState, terminal: true }],
				events: [
					this.#createPeerLifecycleEvent(change.lifecycle),
					{ type: RpcEventTypeEnum.ownerClosing },
				],
			},
			apply: (commitSnapshots) => {
				this.#abortCurrentAttempt();
				beforeSnapshots?.();
				this.#session = undefined;
				commitSnapshots();
				return () => {
					try {
						this.#startCleanup(finalState);
					} finally {
						continueAfterClose?.();
					}
				};
			},
		};
	}

	#createPeerLifecycleEvent(lifecycle: RpcPeerLifecycleFact): RpcEvent {
		return { ...lifecycle, peer: this.peer };
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		const ownerFaultCannotStart =
			this.#insideOwnerFault ||
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed;
		if (ownerFaultCannotStart) {
			return;
		}
		const session = this.#session;
		if (session !== undefined && this.#faultingSessions.has(session)) {
			return;
		}
		this.#insideOwnerFault = true;
		if (session !== undefined) {
			this.#faultingSessions.add(session);
		}
		const releaseFaultFence = (): void => {
			this.#insideOwnerFault = false;
			if (session !== undefined) {
				this.#faultingSessions.delete(session);
			}
		};
		this.#closeFromSession(
			reason,
			error,
			() => {
				try {
					session?.forceClose();
				} catch {
					// The original Protocol fault remains authoritative.
				}
				try {
					this.#protocol.close();
				} catch {
					// The original Protocol fault remains authoritative.
				}
			},
			releaseFaultFence,
		);
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
		this.#terminationRequested = true;
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
			const peerState = this.peer.state;
			const peerStatus = peerState.status;
			// Unbound and connecting Peers can close without draining a Session.
			const peerHasNoSession =
				peerStatus === RpcStateStatusEnum.unbound ||
				peerStatus === RpcStateStatusEnum.connecting;
			let nextPeerState: RpcPeerState | undefined;
			let terminalPeerReason:
				| RpcCloseReasonEnum.gracefulShutdown
				| RpcCloseReasonEnum.forcedClose
				| undefined;
			if (peerStatus === RpcStateStatusEnum.connected) {
				nextPeerState = {
					status: RpcStateStatusEnum.draining,
					reason: RpcCloseReasonEnum.gracefulShutdown,
				};
			} else if (peerStatus === RpcStateStatusEnum.recovering) {
				terminalPeerReason = RpcCloseReasonEnum.forcedClose;
				nextPeerState = {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: terminalPeerReason,
				};
			} else if (peerHasNoSession) {
				terminalPeerReason = RpcCloseReasonEnum.gracefulShutdown;
				nextPeerState = {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: terminalPeerReason,
				};
			}
			const events: RpcEvent[] = [{ type: RpcEventTypeEnum.ownerDraining }];
			const drainingReason =
				nextPeerState?.status === RpcStateStatusEnum.draining
					? nextPeerState.reason
					: peerState.status === RpcStateStatusEnum.draining
						? peerState.reason
						: undefined;
			if (drainingReason !== undefined) {
				events.push({
					type: RpcEventTypeEnum.peerDraining,
					peer: this.peer,
					reason: drainingReason,
				});
			} else if (terminalPeerReason !== undefined) {
				events.push({
					type: RpcEventTypeEnum.peerClosed,
					peer: this.peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: terminalPeerReason,
				});
			}
			const session = this.#session;
			return {
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					peerStates:
						nextPeerState === undefined
							? []
							: [
									{
										peer: this.peer,
										state: nextPeerState,
										terminal: terminalPeerReason !== undefined,
									},
								],
					events,
				},
				apply: (commitSnapshots) => {
					if (peerHasNoSession) {
						this.#abortCurrentAttempt();
					}
					if (peerStatus === RpcStateStatusEnum.recovering) {
						if (session !== undefined) {
							this.#faultingSessions.add(session);
						}
						try {
							session?.forceClose();
						} catch {
							// Force remains selected even when custom Protocol code misbehaves.
						} finally {
							if (session !== undefined) {
								this.#faultingSessions.delete(session);
							}
						}
					}
					if (terminalPeerReason !== undefined) {
						this.#session = undefined;
					}
					commitSnapshots();
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

	#abortCurrentAttempt(): void {
		const attempt = this.#attempt;
		if (attempt === undefined) {
			return;
		}
		this.#finishFailedAttempt(
			attempt,
			false,
			new DOMException(
				"The connection was aborted by its owner.",
				"AbortError",
			),
		);
		this.#attempt = undefined;
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
			const closure = this.#createPeerClosureForOwnerClose(reason);
			const session = this.#session;
			const events: RpcEvent[] = [];
			if (closure.event !== undefined) {
				events.push(closure.event);
			}
			events.push({ type: RpcEventTypeEnum.ownerClosing });
			return {
				publication: {
					state: { status: RpcStateStatusEnum.closing },
					peerStates:
						closure.event === undefined
							? []
							: [
									{
										peer: this.peer,
										state: closure.finalState,
										terminal: true,
									},
								],
					events,
				},
				apply: (commitSnapshots) => {
					if (this.#graceTimer !== undefined) {
						clearTimeout(this.#graceTimer);
						this.#graceTimer = undefined;
					}
					this.#abortCurrentAttempt();
					this.#session = undefined;
					commitSnapshots();
					if (!forced) {
						return () => this.#startCleanup(closure.finalState);
					}
					if (session !== undefined) {
						this.#faultingSessions.add(session);
					}
					try {
						this.#protocol.close();
					} catch {
						// Only cleanup failure rejects the shared termination task.
					} finally {
						if (session !== undefined) {
							this.#faultingSessions.delete(session);
						}
					}
					return () => this.#startCleanup(closure.finalState);
				},
			};
		});
	}

	#createPeerClosureForOwnerClose(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
	): {
		readonly finalState: RpcConnectorPeerClosedState;
		readonly event?: RpcPeerClosedEvent;
	} {
		const peerState = this.peer.state;
		if (peerState.status === RpcStateStatusEnum.closed) {
			return {
				finalState: Object.freeze({
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				}),
			};
		}
		let finalState: RpcConnectorPeerClosedState;
		let event: RpcPeerClosedEvent;
		// Counter drain remains a failed outcome when graceful owner shutdown wins.
		const counterDrainFailedDuringShutdown =
			reason === RpcCloseReasonEnum.gracefulShutdown &&
			peerState.status === RpcStateStatusEnum.draining &&
			peerState.reason === RpcCloseReasonEnum.counterExhaustion;
		if (counterDrainFailedDuringShutdown) {
			finalState = Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.counterExhaustion,
				error: createRpcException(RpcExceptionCodeEnum.unavailable),
			});
			event = {
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.counterExhaustion,
			};
		} else {
			finalState = Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			});
			event = {
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			};
		}
		return { finalState, event };
	}

	#startCleanup(finalState: RpcConnectorClosedState): void {
		void this.#custody.finishCleanup().then(
			() => this.#finishCleanupSuccess(finalState),
			(error: unknown) => this.#finishCleanupFailure(error),
		);
	}

	#finishCleanupSuccess(finalState: RpcConnectorClosedState): void {
		if (this.state.status !== RpcStateStatusEnum.closing) {
			return;
		}
		this.#publisher.finish(finalState, () => this.#resolveTermination?.());
	}

	#finishCleanupFailure(value: unknown): void {
		if (this.state.status !== RpcStateStatusEnum.closing) {
			return;
		}
		const error =
			value instanceof Error ? value : new Error("RPC Owner cleanup failed.");
		this.#publisher.finish(
			{
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.cleanupFailed,
				error,
			},
			() => this.#rejectTermination?.(error),
		);
	}
}

type RpcConnectorClosedState = Extract<
	RpcConnectorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcConnectorPeerClosedState = Extract<
	RpcPeerState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcPeerClosedEvent = Extract<
	RpcEvent,
	{ readonly type: RpcEventTypeEnum.peerClosed }
>;

interface RpcConnectorAttempt {
	readonly abortController: AbortController;
	readonly ownerAbort: Promise<never>;
	readonly rejectOwnerAbort: (error: Error) => void;
	readonly startupCleanup: RpcOwnedCleanup;
	removeExternalAbortListener?: () => void;
	subscription?: Subscription;
	connection?: RpcOwnedConnection;
	provisionalSession?: IRpcProtocolSession;
	insideHandoff: boolean;
	attached: boolean;
	cleanupRequested: boolean;
	fenced: boolean;
	ownerAbortError?: Error;
}

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
