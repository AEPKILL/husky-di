/**
 * @overview Connector Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import {
	BehaviorSubject,
	type Observable,
	Subject,
	type Subscription,
} from "rxjs";
import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcRetainedBytesLedger } from "@/interfaces/protocol/rpc-retained-bytes-ledger.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/rpc-adapter.interface";
import type {
	IRpcConnector,
	RpcEvent,
} from "@/interfaces/rpc-caller.interface";
import type { IRpcConnection } from "@/interfaces/rpc-connection.interface";
import type { IRpcOwnerCustody } from "@/interfaces/rpc-owner-custody.interface";
import type { IRpcPeerRuntime } from "@/interfaces/rpc-peer.interface";
import type {
	RpcConnectorConnectOptions,
	RpcConnectorState,
} from "@/types/rpc-caller.type";
import type { CreateRpcConnectorImplOptions } from "@/types/rpc-owner.type";
import type {
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/types/rpc-owner-custody.type";
import {
	installRpcAbortListener,
	readRpcAbortSignalAborted,
} from "@/utils/rpc-cancellation.util";
import { readRpcClosedOptionsRecord } from "@/utils/rpc-runtime-policy.util";
import {
	rpcCallableSchema,
	rpcNonNullObjectSchema,
	rpcUndefinedSchema,
} from "@/utils/rpc-schema.util";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import { isRpcSessionTransitionAllowed } from "@/utils/rpc-session-transition.util";

const connectorConnectOptionKeys = new Set(["adapter", "signal"]);

function isProtocolSession(value: unknown): value is IRpcProtocolSession {
	if (!rpcNonNullObjectSchema.safeParse(value).success) {
		return false;
	}
	const session = value as object;
	return (
		rpcCallableSchema.safeParse(Reflect.get(session, "reserveInvocation"))
			.success &&
		rpcCallableSchema.safeParse(Reflect.get(session, "forceClose")).success
	);
}

type RpcConnectorClosedState = Extract<
	RpcConnectorState,
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

/** Owns one stable Connector peer and one owner-scoped Protocol runtime. */
export class RpcConnectorImpl implements IRpcConnector {
	readonly #runtime: IRpcProtocolConnectorRuntime;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #stateSubject: BehaviorSubject<RpcConnectorState>;
	readonly #eventSubject = new Subject<RpcEvent>();
	readonly #faultingSessions = new Set<IRpcProtocolSession>();
	readonly #custody: IRpcOwnerCustody;
	readonly #connectionLimit: number;
	#attempt: RpcConnectorAttempt | undefined;
	#session: IRpcProtocolSession | undefined;
	#terminationTask: Promise<void> | undefined;
	#resolveTermination: (() => void) | undefined;
	#rejectTermination: ((error: unknown) => void) | undefined;
	#graceTimer: ReturnType<typeof setTimeout> | undefined;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeerRuntime;

	constructor(options: CreateRpcConnectorImplOptions) {
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
		this.#connectionLimit = policy.maxSessions + 2 * policy.maxHandshakes;
		this.#stateSubject = new BehaviorSubject(
			Object.freeze<RpcConnectorState>({ status: RpcStateStatusEnum.active }),
		);
		this.state$ = this.#stateSubject.asObservable();
		this.event$ = this.#eventSubject.asObservable();
		this.peer = createPeer({
			initialState: { status: RpcStateStatusEnum.unbound },
			ownerExposureRegistry: new Map(),
			isOwnerActive: () => this.state.status === RpcStateStatusEnum.active,
			emitEvent: (event) => this.#eventSubject.next(event),
			onProtocolFault: (error) =>
				this.protocolFault(RpcCloseReasonEnum.protocolFault, error),
			handlerScheduler,
			maximumIncomingBytes: Math.floor(policy.maxRetainedBytesPerSession / 4),
			reserveRetainedBytes: (bytes) =>
				reserveRpcSessionRetainedBytes(
					this.#session ?? this.#attempt?.provisionalSession,
					(ownerBytes) => this.reserveRetainedBytes(ownerBytes),
					bytes,
				),
		});
	}

	get state(): RpcConnectorState {
		return this.#stateSubject.value;
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
		if (
			this.state.status !== RpcStateStatusEnum.active ||
			(this.peer.state.status !== RpcStateStatusEnum.unbound &&
				this.peer.state.status !== RpcStateStatusEnum.recovering) ||
			this.#attempt !== undefined ||
			this.#custody.connectionCount >= this.#connectionLimit
		) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const optionRecord = readRpcClosedOptionsRecord(
			options,
			connectorConnectOptionKeys,
			"options",
		);
		const signal = optionRecord.signal;
		if (signal !== undefined && readRpcAbortSignalAborted(signal)) {
			return Promise.reject(
				new DOMException("The connection attempt was aborted.", "AbortError"),
			);
		}
		const adapter = optionRecord.adapter as IRpcConnectorAdapter;
		if (!rpcNonNullObjectSchema.safeParse(adapter).success) {
			return Promise.reject(new TypeError("adapter must be an object."));
		}

		const connectionSource = Reflect.get(adapter, "connection$") as unknown;
		const connect = Reflect.get(adapter, "connect");
		const subscribe = rpcUndefinedSchema.safeParse(connectionSource).success
			? undefined
			: Reflect.get(connectionSource as object, "subscribe");
		if (
			!rpcCallableSchema.safeParse(subscribe).success ||
			!rpcCallableSchema.safeParse(connect).success
		) {
			return Promise.reject(new TypeError("adapter has an invalid shape."));
		}
		const validConnectionSource =
			connectionSource as Observable<IRpcConnection>;

		const fresh = this.peer.state.status === RpcStateStatusEnum.unbound;
		if (fresh) {
			this.peer.commitState({ status: RpcStateStatusEnum.connecting });
		}
		const { promise: ownerAbort, reject: rejectOwnerAbort } =
			Promise.withResolvers<never>();
		void ownerAbort.catch(() => {});
		const {
			promise: adapterStartup,
			resolve: resolveAdapterStartup,
			reject: rejectAdapterStartup,
		} = Promise.withResolvers<void>();
		let attempt!: RpcConnectorAttempt;
		const startupCleanupTask = adapterStartup.then(
			() => undefined,
			(error: unknown) => {
				if (
					attempt.cleanupRequested &&
					!(error instanceof DOMException && error.name === "AbortError")
				) {
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
					if (attempt.fenced || this.#attempt !== attempt) {
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
						const result = this.#runtime.bind(
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
				Reflect.apply(connect, adapter, [attempt.abortController.signal]),
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
					if (
						session === undefined ||
						attempt.fenced ||
						this.#attempt !== attempt ||
						this.state.status !== RpcStateStatusEnum.active ||
						!this.peer.attachProtocolSession(session)
					) {
						throw new Error("Protocol did not attach a Connector Session.");
					}
					attempt.provisionalSession = undefined;
					this.#session = session;
					this.peer.commitState({ status: RpcStateStatusEnum.connected });
					if (attempt.ownerAbortError !== undefined) {
						throw attempt.ownerAbortError;
					}
					if (
						this.state.status !== RpcStateStatusEnum.active ||
						!this.#isPeerConnected()
					) {
						throw new Error(
							"Connector terminated before startup could settle.",
						);
					}
					this.#eventSubject.next({
						type: RpcEventTypeEnum.peerOpened,
						peer: this.peer,
					});
					return;
				}
				if (
					this.#session === undefined ||
					this.peer.state.status !== RpcStateStatusEnum.connected
				) {
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
		if (fresh && this.#session === undefined) {
			this.peer.commitState({ status: RpcStateStatusEnum.unbound });
		}
	}

	/** Package-private Protocol attachment port. */
	attachProtocolSession(
		session: IRpcProtocolSession,
	): IRpcProtocolSessionHost | undefined {
		const attempt = this.#attempt;
		if (
			attempt === undefined ||
			attempt.fenced ||
			attempt.insideHandoff ||
			attempt.attached ||
			this.#session !== undefined ||
			!isProtocolSession(session)
		) {
			return undefined;
		}

		attempt.attached = true;
		attempt.provisionalSession = session;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request) =>
				this.peer.reserveIncomingProtocolCall(request),
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
		if (
			(this.#session !== session && !provisional) ||
			this.peer.state.status === RpcStateStatusEnum.closed ||
			this.#faultingSessions.has(session)
		) {
			return;
		}
		this.#faultingSessions.add(session);
		try {
			if (provisional && attempt !== undefined) {
				this.#finishFailedAttempt(
					attempt,
					true,
					createRpcException(RpcExceptionCodeEnum.protocol, error),
				);
				return;
			}
			try {
				session.forceClose();
			} catch {
				// The original Session fault remains authoritative.
			}
			if (this.#session === session) {
				this.#closeFromSession(reason, error);
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
		if (
			this.#session !== session ||
			this.peer.state.status === RpcStateStatusEnum.closed
		) {
			return;
		}
		if (
			!isRpcSessionTransitionAllowed(
				this.state.status,
				this.peer.state,
				transition,
			)
		) {
			this.#faultSession(
				session,
				RpcCloseReasonEnum.protocolFault,
				new Error("Protocol requested an invalid Session transition."),
			);
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
			this.peer.commitState({ status: RpcStateStatusEnum.recovering });
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerRecovering,
				peer: this.peer,
			});
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
			this.peer.commitState({ status: RpcStateStatusEnum.connected });
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerRecovered,
				peer: this.peer,
			});
			return;
		}
		if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
			this.peer.commitState({
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			});
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerDraining,
				peer: this.peer,
				reason: RpcCloseReasonEnum.counterExhaustion,
			});
			return;
		}
		this.#closeFromSession(transition.reason, transition.cause);
	}

	#closeFromSession(reason: RpcSessionCloseReason, cause?: Error): void {
		if (
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed
		) {
			return;
		}
		this.#abortCurrentAttempt();
		if (this.#terminationTask === undefined) {
			this.#createTerminationTask();
		}
		const failed =
			reason === RpcCloseReasonEnum.recoveryExpired ||
			reason === RpcCloseReasonEnum.counterExhaustion ||
			reason === RpcCloseReasonEnum.continuityFailure ||
			reason === RpcCloseReasonEnum.protocolFault ||
			reason === RpcCloseReasonEnum.resourceFault;
		let finalState: RpcConnectorClosedState;
		let peerEvent: RpcPeerClosedEvent;
		if (!failed) {
			finalState = Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			});
			peerEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			};
		} else if (
			reason === RpcCloseReasonEnum.recoveryExpired ||
			reason === RpcCloseReasonEnum.counterExhaustion
		) {
			const error = createRpcException(RpcExceptionCodeEnum.unavailable, cause);
			finalState = Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error,
			});
			peerEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
			};
		} else {
			const error = createRpcException(RpcExceptionCodeEnum.protocol, cause);
			finalState = Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error,
			});
			peerEvent = {
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
			};
		}
		this.peer.stageState(finalState);
		this.#session = undefined;
		this.#stateSubject.next(
			Object.freeze({ status: RpcStateStatusEnum.closing }),
		);
		this.peer.flushState();
		this.#eventSubject.next(peerEvent);
		this.peer.completeState();
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerClosing });
		this.#startCleanup(finalState);
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		try {
			this.#session?.forceClose();
		} catch {
			// The original Protocol fault remains authoritative.
		}
		try {
			this.#runtime.close();
		} catch {
			// The original Protocol fault remains authoritative.
		}
		this.#closeFromSession(reason, error);
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
		if (
			this.state.status === RpcStateStatusEnum.active ||
			this.state.status === RpcStateStatusEnum.draining
		) {
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
		this.#stateSubject.next(
			Object.freeze({ status: RpcStateStatusEnum.draining }),
		);
		const peerStatus = this.peer.state.status;
		let terminalPeerReason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| undefined;
		if (peerStatus === RpcStateStatusEnum.connected) {
			this.peer.commitState({
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.gracefulShutdown,
			});
		} else if (peerStatus === RpcStateStatusEnum.recovering) {
			try {
				this.#session?.forceClose();
			} catch {
				// Force remains selected even when custom Protocol code misbehaves.
			}
			terminalPeerReason = RpcCloseReasonEnum.forcedClose;
			this.peer.commitState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: terminalPeerReason,
			});
		} else if (
			peerStatus === RpcStateStatusEnum.unbound ||
			peerStatus === RpcStateStatusEnum.connecting
		) {
			this.#abortCurrentAttempt();
			terminalPeerReason = RpcCloseReasonEnum.gracefulShutdown;
			this.peer.commitState({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: terminalPeerReason,
			});
		}
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerDraining });
		if (this.peer.state.status === RpcStateStatusEnum.draining) {
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerDraining,
				peer: this.peer,
				reason: this.peer.state.reason,
			});
		} else if (terminalPeerReason !== undefined) {
			this.#eventSubject.next({
				type: RpcEventTypeEnum.peerClosed,
				peer: this.peer,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: terminalPeerReason,
			});
			this.#session = undefined;
			this.peer.completeState();
		}

		this.#graceTimer = setTimeout(
			() => this.#beginClosing(RpcCloseReasonEnum.shutdownDeadline, true),
			this.#policy.shutdownDeadlineMs,
		);
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

	#abortCurrentAttempt(): void {
		const attempt = this.#attempt;
		if (attempt === undefined) {
			return;
		}
		this.#finishFailedAttempt(
			attempt,
			true,
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
		if (
			this.state.status === RpcStateStatusEnum.closing ||
			this.state.status === RpcStateStatusEnum.closed
		) {
			return;
		}
		if (this.#graceTimer !== undefined) {
			clearTimeout(this.#graceTimer);
			this.#graceTimer = undefined;
		}
		this.#abortCurrentAttempt();
		if (forced) {
			try {
				this.#runtime.close();
			} catch {
				// Only cleanup failure rejects the shared termination task.
			}
		}
		const closure = this.#stagePeerForOwnerClose(reason);
		this.#stateSubject.next(
			Object.freeze({ status: RpcStateStatusEnum.closing }),
		);
		this.peer.flushState();
		if (closure.event !== undefined) {
			this.#eventSubject.next(closure.event);
		}
		this.peer.completeState();
		this.#eventSubject.next({ type: RpcEventTypeEnum.ownerClosing });
		this.#startCleanup(closure.finalState);
	}

	#stagePeerForOwnerClose(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
	): {
		readonly finalState: RpcConnectorClosedState;
		readonly event?: RpcPeerClosedEvent;
	} {
		if (this.peer.state.status === RpcStateStatusEnum.closed) {
			return {
				finalState: Object.freeze({
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				}),
			};
		}
		let finalState: RpcConnectorClosedState;
		let event: RpcPeerClosedEvent;
		if (
			reason === RpcCloseReasonEnum.gracefulShutdown &&
			this.peer.state.status === RpcStateStatusEnum.draining &&
			this.peer.state.reason === RpcCloseReasonEnum.counterExhaustion
		) {
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
		this.peer.stageState(finalState);
		this.#session = undefined;
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
		this.#stateSubject.next(finalState);
		this.#stateSubject.complete();
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
		this.#stateSubject.next(
			Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.cleanupFailed,
				error,
			}),
		);
		this.#stateSubject.complete();
		this.#eventSubject.next({
			type: RpcEventTypeEnum.topologyClosed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.cleanupFailed,
		});
		this.#eventSubject.complete();
		this.#rejectTermination?.(error);
	}
}
