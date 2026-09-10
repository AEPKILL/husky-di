/**
 * @overview RPC Connector Topology Owner implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable } from "rxjs";
import { createRpcConnectorAttempt } from "@/modules/owner/factories/rpc-startup-attempt.factory";
import type { IRpcConnector } from "@/modules/owner/interfaces/rpc-connector.interface";
import type {
	IRpcOwnerCustody,
	RpcOwnerCustodyFactory,
} from "@/modules/owner/interfaces/rpc-owner-custody.interface";
import type { RpcOwnerProtocolConnectorFactory } from "@/modules/owner/interfaces/rpc-owner-protocol.interface";
import type { IRpcConnectorPublisher } from "@/modules/owner/interfaces/rpc-owner-publisher.interface";
import type {
	IRpcOwnerTermination,
	RpcOwnerTerminationFactory,
} from "@/modules/owner/interfaces/rpc-owner-termination.interface";
import type {
	IRpcConnectorSessionAttachment,
	IRpcConnectorSessionOwnership,
	RpcConnectorSessionOwnershipFactory,
} from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import type {
	RpcConnectorClosedState,
	RpcConnectorConnectOptions,
	RpcConnectorState,
} from "@/modules/owner/types/rpc-caller.type";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcConnectorAttempt } from "@/modules/owner/types/rpc-startup-attempt.type";
import { parseRpcConnectorStartup } from "@/modules/owner/utils/parse-rpc-startup.util";
import type { IRpcHandlerScheduler, IRpcPeer } from "@/modules/peer";
import {
	type IRpcProtocolConnector,
	type IRpcProtocolRuntimePolicy,
	type IRpcProtocolSession,
	type IRpcProtocolSessionHost,
	type IRpcRetainedBytesReservation,
	RPC_CONNECTIONS_PER_HANDSHAKE,
	RPC_SESSION_BYTE_SUBCAP_DIVISOR,
	type RpcProtocolFaultReason,
} from "@/modules/protocol";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";
import type { IRpcRetainedBytesLedger } from "@/shared/interfaces/rpc-retained-bytes-ledger.interface";
import { installRpcAbortListener } from "@/shared/utils/rpc-cancellation.util";

export type CreateRpcConnectorImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly createCustody: RpcOwnerCustodyFactory;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createSessionOwnership: RpcConnectorSessionOwnershipFactory;
	readonly createTermination: RpcOwnerTerminationFactory<RpcConnectorClosedState>;
	readonly publisher: IRpcConnectorPublisher;
	readonly createProtocol: RpcOwnerProtocolConnectorFactory;
}>;

/** Owns one stable Connector peer and one owner-scoped Protocol role. */
export class RpcConnectorImpl implements IRpcConnector {
	readonly #protocol: IRpcProtocolConnector;
	readonly #retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly #publisher: IRpcConnectorPublisher;
	readonly #sessionOwnership: IRpcConnectorSessionOwnership;
	readonly #custody: IRpcOwnerCustody;
	readonly #connectionLimit: number;
	#attempt: RpcConnectorAttempt | undefined;
	#terminationRequested = false;
	readonly #termination: IRpcOwnerTermination;
	readonly state$: Observable<RpcConnectorState>;
	readonly event$: Observable<RpcEvent>;
	readonly peer: IRpcPeer;

	constructor(options: CreateRpcConnectorImplOptions) {
		const {
			createSessionOwnership,
			createTermination,
			createCustody,
			handlerScheduler,
			publisher,
			policy,
			retainedBytesLedger,
			createProtocol,
		} = options;
		this.#publisher = publisher;
		this.#retainedBytesLedger = retainedBytesLedger;
		this.#connectionLimit =
			policy.maxSessions + RPC_CONNECTIONS_PER_HANDSHAKE * policy.maxHandshakes;
		this.state$ = publisher.state$;
		this.event$ = publisher.event$;
		const protocol = createProtocol({
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			fault: (reason, error) => this.protocolFault(reason, error),
			attachSession: (session) => this.attachSession(session),
		});
		this.#protocol = protocol;
		const custody = createCustody(() => protocol.cleanup());
		this.#custody = custody;
		const termination = createTermination({
			deadlineMs: policy.shutdownDeadlineMs,
			gateNewWork: () => {
				this.#terminationRequested = true;
			},
			readStatus: () => publisher.state.status,
			transactions: Object.freeze({
				beginGracefulShutdown: () =>
					this.#sessionOwnership.beginGracefulShutdown(),
				beginClosing: (reason, forced) =>
					this.#sessionOwnership.beginClosing(reason, forced),
			}),
			protocol: Object.freeze({ shutdown: () => protocol.shutdown() }),
			custody: Object.freeze({ finishCleanup: () => custody.finishCleanup() }),
			finalization: Object.freeze({
				releaseReferences: () => {},
				finish: (state, settle) => publisher.finish(state, settle),
			}),
		});
		this.#termination = termination.owner;
		this.#sessionOwnership = createSessionOwnership({
			publisher,
			protocol,
			termination: termination.lifecycle,
			peerEnvironment: {
				findOwnerExposure: () => undefined,
				isOwnerActive: () =>
					!this.#terminationRequested &&
					this.state.status === RpcStateStatusEnum.active,
				handlerScheduler,
				maximumIncomingBytes: Math.floor(
					policy.maxRetainedBytesPerSession / RPC_SESSION_BYTE_SUBCAP_DIVISOR,
				),
				reserveOwnerRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			},
			lifecycle: {
				abortCurrentAttempt: () => this.#abortCurrentAttempt(),
				failProvisionalAttachment: (attachment, error) =>
					this.#failProvisionalAttachment(attachment, error),
			},
		});
		this.peer = this.#sessionOwnership.peer;
	}

	get state(): RpcConnectorState {
		return this.#publisher.state;
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
		const {
			adapter,
			signal,
			connection$: validConnectionSource,
			connect: validConnect,
		} = parseRpcConnectorStartup(options);

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
		const created = createRpcConnectorAttempt(this.#custody);
		const { adapterStartup, resolveAdapterStartup, rejectAdapterStartup } =
			created;
		attempt = created.attempt;
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
		return this.#termination.shutdown();
	}

	close(): Promise<void> {
		return this.#termination.close();
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
}
