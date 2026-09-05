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
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { RpcAcceptorSessionOwnershipFactory } from "@/factories/rpc-session-ownership.factory";
import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcAcceptor } from "@/interfaces/owner/rpc-acceptor.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type {
	IRpcOwnerCustody,
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcAcceptorPublisher } from "@/interfaces/owner/rpc-owner-publisher.interface";
import type { IRpcAcceptorSessionOwnership } from "@/interfaces/owner/rpc-session-ownership.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcAcceptorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import type {
	RpcAcceptorListenerState,
	RpcAcceptorState,
} from "@/types/common/rpc-caller.type";
import type { RpcExposureRegistry } from "@/types/common/rpc-exposure.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type {
	RemoteServiceDescriptor,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/peer/remote-service-descriptor.type";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
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
	readonly createSessionOwnership: RpcAcceptorSessionOwnershipFactory;
	readonly publisher: IRpcAcceptorPublisher;
	readonly protocol: IRpcProtocolAcceptor;
}>;

/** Owns Acceptor listener state and its current stable peer membership. */
export class RpcAcceptorImpl implements IRpcAcceptor {
	readonly #protocol: IRpcProtocolAcceptor;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #ownerExposures: RpcExposureRegistry = new Map();
	readonly #sessionOwnership: IRpcAcceptorSessionOwnership;
	readonly #custody: IRpcOwnerCustody;
	readonly #publisher: IRpcAcceptorPublisher;
	readonly #ordinaryConnectionLimit: number;
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
			createSessionOwnership,
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
		this.#publisher = publisher;
		this.#sessionOwnership = createSessionOwnership({
			publisher,
			protocol,
			maximumSessions: policy.maxSessions,
			peerEnvironment: {
				findOwnerExposure: (wireName) => this.#ownerExposures.get(wireName),
				isOwnerActive: () =>
					this.#terminationTask === undefined &&
					this.state.status === RpcStateStatusEnum.active,
				handlerScheduler,
				maximumIncomingBytes: Math.floor(policy.maxRetainedBytesPerSession / 4),
				reserveOwnerRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			},
			lifecycle: {
				canAdmitSession: () =>
					this.#terminationTask === undefined && !this.#insideConnectionHandoff,
				ensureTermination: () => {
					if (this.#terminationTask === undefined) {
						this.#createTerminationTask();
					}
				},
				clearGraceTimer: () => this.#clearGraceTimer(),
				abortListener: () => this.#abortListener(),
				continueGracefulShutdown: () => this.#continueGracefulShutdown(),
				startCleanup: (finalState) => this.#startCleanup(finalState),
			},
		});
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
				this.#sessionOwnership.hasLocalExposure(wireName),
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
		this.#sessionOwnership.beginGracefulShutdown();
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

	#clearGraceTimer(): void {
		if (this.#graceTimer === undefined) {
			return;
		}
		clearTimeout(this.#graceTimer);
		this.#graceTimer = undefined;
	}

	#beginClosing(
		reason:
			| RpcCloseReasonEnum.gracefulShutdown
			| RpcCloseReasonEnum.forcedClose
			| RpcCloseReasonEnum.shutdownDeadline,
		forced: boolean,
	): void {
		this.#sessionOwnership.beginClosing(reason, forced);
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
		return this.#sessionOwnership.admit(session);
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		this.#sessionOwnership.protocolFault(reason, error);
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
