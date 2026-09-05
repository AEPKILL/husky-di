/**
 * @overview RPC Connector Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable, Subscription } from "rxjs";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { RpcConnectorSessionOwnershipFactory } from "@/factories/rpc-session-ownership.factory";
import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcConnector } from "@/interfaces/owner/rpc-connector.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type {
	IRpcOwnerCustody,
	RpcOwnedCleanup,
	RpcOwnedConnection,
} from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcConnectorPublisher } from "@/interfaces/owner/rpc-owner-publisher.interface";
import type {
	IRpcConnectorSessionAttachment,
	IRpcConnectorSessionOwnership,
} from "@/interfaces/owner/rpc-session-ownership.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcProtocolConnector,
	IRpcProtocolRuntimePolicy,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcProtocolFaultReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcConnectorAdapter } from "@/interfaces/transport/rpc-adapter.interface";
import type { IRpcConnection } from "@/interfaces/transport/rpc-connection.interface";
import {
	type RpcConnectorConnectOptions,
	type RpcConnectorState,
	rpcConnectorAdapterMembersSchema,
	rpcConnectorCallableSchema,
	rpcConnectorConnectOptionsSchema,
	rpcConnectorObservableSchema,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import { installRpcAbortListener } from "@/utils/rpc-cancellation.util";

export type CreateRpcConnectorImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly custody: IRpcOwnerCustody;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createSessionOwnership: RpcConnectorSessionOwnershipFactory;
	readonly publisher: IRpcConnectorPublisher;
	readonly protocol: IRpcProtocolConnector;
}>;

/** Owns one stable Connector peer and one owner-scoped Protocol role. */
export class RpcConnectorImpl implements IRpcConnector {
	readonly #protocol: IRpcProtocolConnector;
	readonly #policy: IRpcProtocolRuntimePolicy;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #publisher: IRpcConnectorPublisher;
	readonly #sessionOwnership: IRpcConnectorSessionOwnership;
	readonly #custody: IRpcOwnerCustody;
	readonly #connectionLimit: number;
	#attempt: RpcConnectorAttempt | undefined;
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
		this.#publisher = publisher;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#connectionLimit = policy.maxSessions + 2 * policy.maxHandshakes;
		this.state$ = publisher.state$;
		this.event$ = publisher.event$;
		this.#sessionOwnership = createSessionOwnership({
			publisher,
			protocol,
			peerEnvironment: {
				findOwnerExposure: () => undefined,
				isOwnerActive: () =>
					!this.#terminationRequested &&
					this.state.status === RpcStateStatusEnum.active,
				handlerScheduler,
				maximumIncomingBytes: Math.floor(policy.maxRetainedBytesPerSession / 4),
				reserveOwnerRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			},
			lifecycle: {
				ensureTermination: () => {
					if (this.#terminationTask === undefined) {
						this.#createTerminationTask();
					}
				},
				abortCurrentAttempt: () => this.#abortCurrentAttempt(),
				failProvisionalAttachment: (attachment, error) =>
					this.#failProvisionalAttachment(attachment, error),
				clearGraceTimer: () => this.#clearGraceTimer(),
				continueGracefulShutdown: () => this.#continueGracefulShutdown(),
				startCleanup: (finalState) => this.#startCleanup(finalState),
			},
		});
		this.peer = this.#sessionOwnership.peer;
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
					const attachment = attempt.attachment;
					if (
						attachment === undefined ||
						!attachment.activate(
							() =>
								!this.#terminationRequested &&
								!attempt.fenced &&
								attempt.ownerAbortError === undefined &&
								this.#attempt === attempt,
						)
					) {
						throw new Error("Protocol did not attach a Connector Session.");
					}
					if (attempt.ownerAbortError !== undefined) {
						throw attempt.ownerAbortError;
					}
					// Startup can publish success only while the Connector and Peer remain active.
					const startupBecameStale =
						this.#terminationRequested ||
						this.state.status !== RpcStateStatusEnum.active ||
						this.#attempt !== attempt ||
						!attachment.active ||
						!this.#isPeerConnected();
					if (startupBecameStale) {
						throw new Error(
							"Connector terminated before startup could settle.",
						);
					}
					return;
				}
				// Resume startup must leave the retained Session connected.
				const resumedSessionIsMissing =
					this.#terminationRequested ||
					this.state.status !== RpcStateStatusEnum.active ||
					this.#attempt !== attempt ||
					!this.#sessionOwnership.attached ||
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
		const attachment = attempt.attachment;
		attempt.attachment = undefined;
		attachment?.discard();
		if (attempt.connection !== undefined) {
			attempt.connection.directClose();
		}
		if (fresh) {
			this.#publisher.enqueue(() => {
				const fallbackBecameStale =
					this.#terminationRequested ||
					this.state.status !== RpcStateStatusEnum.active ||
					this.#attempt !== attempt ||
					this.#sessionOwnership.attached ||
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
			attempt.attachment !== undefined ||
			this.#sessionOwnership.attached;
		if (cannotAttachSession) {
			return undefined;
		}
		const attachment = this.#sessionOwnership.attach(session);
		if (attachment === undefined) {
			return undefined;
		}
		attempt.attachment = attachment;
		return attachment.host;
	}

	/** Package-private shared Protocol fault port. */
	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		this.#sessionOwnership.protocolFault(reason, error);
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

	#failProvisionalAttachment(
		attachment: IRpcConnectorSessionAttachment,
		error: Error,
	): void {
		const attempt = this.#attempt;
		if (attempt?.attachment !== attachment) {
			return;
		}
		this.#finishFailedAttempt(attempt, true, error);
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
		this.#sessionOwnership.beginClosing(reason, forced);
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

interface RpcConnectorAttempt {
	readonly abortController: AbortController;
	readonly ownerAbort: Promise<never>;
	readonly rejectOwnerAbort: (error: Error) => void;
	readonly startupCleanup: RpcOwnedCleanup;
	removeExternalAbortListener?: () => void;
	subscription?: Subscription;
	connection?: RpcOwnedConnection;
	attachment?: IRpcConnectorSessionAttachment;
	insideHandoff: boolean;
	cleanupRequested: boolean;
	fenced: boolean;
	ownerAbortError?: Error;
}
