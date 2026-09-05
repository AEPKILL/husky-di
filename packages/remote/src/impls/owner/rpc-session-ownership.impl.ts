/**
 * @overview Owns role-specific Logical Session, stable Peer, publication, fencing, and release choreography.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { RpcPeerFactory } from "@/factories/rpc-peer.factory";
import type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "@/interfaces/owner/rpc-owner-publisher.interface";
import type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionAttachment,
	IRpcConnectorSessionOwnership,
	RpcOwnerCloseReason,
	RpcSessionPeerEnvironment,
} from "@/interfaces/owner/rpc-session-ownership.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerHost,
	RpcPeerStateView,
} from "@/interfaces/peer/rpc-peer-host.interface";
import type {
	IRpcProtocolAcceptor,
	IRpcProtocolConnector,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcAcceptorState,
	RpcConnectorState,
	RpcPeerState,
} from "@/types/common/rpc-caller.type";
import type { RpcEvent } from "@/types/owner/rpc-event.type";
import type {
	RpcConnectorCommit,
	RpcPeerStatePublication,
} from "@/types/owner/rpc-owner-publication.type";
import type { RpcCallEventSink } from "@/types/peer/rpc-peer-call-event.type";
import { reserveRpcSessionRetainedBytes } from "@/utils/rpc-session-retained-bytes.util";
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

export type CreateRpcConnectorSessionOwnershipOptions = Readonly<{
	readonly publisher: IRpcConnectorPublisher;
	readonly protocol: IRpcProtocolConnector;
	readonly peerEnvironment: RpcSessionPeerEnvironment;
	readonly lifecycle: Readonly<{
		ensureTermination(): void;
		abortCurrentAttempt(): void;
		failProvisionalAttachment(
			attachment: IRpcConnectorSessionAttachment,
			error: Error,
		): void;
		clearGraceTimer(): void;
		continueGracefulShutdown(): void;
		startCleanup(
			finalState: Extract<
				RpcConnectorState,
				{ readonly status: RpcStateStatusEnum.closed }
			>,
		): void;
	}>;
}>;

export type CreateRpcAcceptorSessionOwnershipOptions = Readonly<{
	readonly publisher: IRpcAcceptorPublisher;
	readonly protocol: IRpcProtocolAcceptor;
	readonly maximumSessions: number;
	readonly peerEnvironment: RpcSessionPeerEnvironment;
	readonly lifecycle: Readonly<{
		canAdmitSession(): boolean;
		ensureTermination(): void;
		clearGraceTimer(): void;
		abortListener(): void;
		continueGracefulShutdown(): void;
		startCleanup(
			finalState: Extract<
				RpcAcceptorState,
				{ readonly status: RpcStateStatusEnum.closed }
			>,
		): void;
	}>;
}>;

/** Owns the complete one-to-one Connector Session and Peer transaction sequence. */
export class RpcConnectorSessionOwnershipImpl
	implements IRpcConnectorSessionOwnership
{
	readonly #options: CreateRpcConnectorSessionOwnershipOptions;
	readonly #record: RpcSessionRecord;
	#attachment: RpcConnectorSessionAttachmentImpl | undefined;
	#active = false;
	#insideOwnerFault = false;

	constructor(
		options: CreateRpcConnectorSessionOwnershipOptions,
		dependencies: RpcSessionOwnershipDependencies,
	) {
		this.#options = options;
		this.#record = new RpcSessionRecord(
			{
				initialPeerState: { status: RpcStateStatusEnum.unbound },
				registerPeer: (initialState, build) =>
					options.publisher.registerPeer(initialState, build),
				callEventSink: options.publisher.callEventSink,
				peerEnvironment: options.peerEnvironment,
				readPeerSession: (session) => (this.#active ? session : undefined),
				onTransition: (session, transition) =>
					this.#transition(session, transition),
				onFault: (session, reason, error) =>
					this.#fault(session, reason, error),
				onPeerProtocolFault: (_session, error) =>
					this.protocolFault(RpcCloseReasonEnum.protocolFault, error),
			},
			dependencies,
		);
	}

	get peer(): IRpcPeer {
		return this.#record.peer;
	}

	get attached(): boolean {
		return this.#record.session !== undefined;
	}

	attach(
		session: IRpcProtocolSession,
	): IRpcConnectorSessionAttachment | undefined {
		const host = this.#record.attach(session);
		if (host === undefined) {
			return undefined;
		}
		let attachment!: RpcConnectorSessionAttachmentImpl;
		attachment = new RpcConnectorSessionAttachmentImpl(
			host,
			() => this.#active && this.#attachment === attachment,
			(canActivate) => this.#activate(attachment, canActivate),
			() => this.#discard(attachment),
		);
		this.#attachment = attachment;
		this.#active = false;
		return attachment;
	}

	#activate(
		attachment: RpcConnectorSessionAttachmentImpl,
		canActivate: () => boolean,
	): boolean {
		let activated = false;
		this.#options.publisher.enqueue(() => {
			const activationBecameStale =
				this.#attachment !== attachment ||
				this.#active ||
				this.#record.session === undefined ||
				this.#options.publisher.state.status !== RpcStateStatusEnum.active ||
				this.peer.state.status !== RpcStateStatusEnum.connecting ||
				!canActivate();
			if (activationBecameStale) {
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
					this.#active = true;
					commitSnapshots();
					activated = true;
					return undefined;
				},
			};
		});
		if (!activated) {
			return false;
		}

		// The connected snapshot flushes first so reentrant termination can
		// invalidate the lifecycle event without exposing a stale Peer opening.
		this.#options.publisher.enqueue(() => {
			const openedEventBecameStale =
				this.#attachment !== attachment ||
				!this.#active ||
				this.#record.session === undefined ||
				this.#options.publisher.state.status !== RpcStateStatusEnum.active ||
				this.peer.state.status !== RpcStateStatusEnum.connected ||
				!canActivate();
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
		return true;
	}

	#discard(attachment: RpcConnectorSessionAttachmentImpl): void {
		if (this.#attachment !== attachment || this.#active) {
			return;
		}
		const retained = this.#releaseSession();
		if (retained !== undefined) {
			forceSession(retained);
		}
	}

	#releaseSession(
		expected?: IRpcProtocolSession,
	): IRpcProtocolSession | undefined {
		const retained = this.#record.release(expected);
		if (retained !== undefined) {
			this.#attachment = undefined;
			this.#active = false;
		}
		return retained;
	}

	beginGracefulShutdown(): void {
		this.#options.publisher.enqueue(() => {
			if (this.#options.publisher.state.status !== RpcStateStatusEnum.active) {
				return undefined;
			}
			const peerState = this.peer.state;
			const peerStatus = peerState.status;
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
			const session = this.#record.session;
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
						this.#options.lifecycle.abortCurrentAttempt();
					}
					if (peerStatus === RpcStateStatusEnum.recovering) {
						const releaseFence =
							session === undefined ? undefined : this.#record.fence(session);
						if (session !== undefined) {
							forceSession(session);
						}
						releaseFence?.();
					}
					if (terminalPeerReason !== undefined) {
						this.#releaseSession(session);
					}
					commitSnapshots();
					return this.#options.lifecycle.continueGracefulShutdown;
				},
			};
		});
	}

	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void {
		this.#options.publisher.enqueue(() => {
			const terminationAlreadyStarted =
				this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
				this.#options.publisher.state.status === RpcStateStatusEnum.closed;
			if (terminationAlreadyStarted) {
				return undefined;
			}
			const closure = createConnectorPeerClosure(this.peer, reason);
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
					this.#options.lifecycle.clearGraceTimer();
					this.#options.lifecycle.abortCurrentAttempt();
					this.#releaseSession();
					commitSnapshots();
					if (forced) {
						closeProtocol(this.#options.protocol);
					}
					return () => this.#options.lifecycle.startCleanup(closure.finalState);
				},
			};
		});
	}

	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		const ownerFaultCannotStart =
			this.#insideOwnerFault ||
			this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
			this.#options.publisher.state.status === RpcStateStatusEnum.closed;
		if (ownerFaultCannotStart) {
			return;
		}
		const session = this.#active ? this.#record.session : undefined;
		const releaseSessionFence =
			session === undefined ? undefined : this.#record.fence(session);
		if (session !== undefined && releaseSessionFence === undefined) {
			return;
		}
		this.#insideOwnerFault = true;
		this.#closeFromSession(
			resolveSessionClosure(reason, error),
			() => {
				if (session !== undefined) {
					forceSession(session);
				}
				closeProtocol(this.#options.protocol);
			},
			() => {
				this.#insideOwnerFault = false;
				releaseSessionFence?.();
			},
		);
	}

	#transition(
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		const current =
			this.#active &&
			!this.#record.isFenced(session) &&
			this.#record.owns(session) &&
			this.peer.state.status !== RpcStateStatusEnum.closed;
		if (
			current &&
			transition.type === RpcProtocolSessionTransitionTypeEnum.closed
		) {
			this.#options.lifecycle.ensureTermination();
		}
		this.#options.publisher.enqueue(() => {
			if (!this.#active || this.#record.isFenced(session)) {
				return undefined;
			}
			if (
				!this.#record.owns(session) ||
				this.peer.state.status === RpcStateStatusEnum.closed
			) {
				return undefined;
			}
			const decision = resolveSessionTransition(
				this.#options.publisher.state.status,
				this.peer.state,
				transition,
			);
			if (decision.kind === "fault") {
				this.#fault(session, decision.reason, decision.error);
				return undefined;
			}
			if (decision.terminal) {
				return this.#createSessionCloseCommit(decision);
			}
			return {
				publication: {
					peerStates: [{ peer: this.peer, state: decision.state }],
					events: [withPeer(this.peer, decision.lifecycle)],
				},
			};
		});
	}

	#fault(
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		const releaseFence = this.#record.fence(session);
		if (releaseFence === undefined) {
			return;
		}
		const attachment = this.#attachment;
		if (!this.#active && attachment !== undefined) {
			try {
				this.#options.lifecycle.failProvisionalAttachment(
					attachment,
					createRpcException(RpcExceptionCodeEnum.protocol, error),
				);
			} finally {
				attachment.discard();
				releaseFence();
			}
			return;
		}
		this.#closeFromSession(
			resolveSessionClosure(reason, error),
			() => forceSession(session),
			releaseFence,
			session,
		);
	}

	#closeFromSession(
		change: RpcSessionTerminalChange,
		beforeSnapshots?: () => void,
		continueAfterClose?: () => void,
		expectedSession?: IRpcProtocolSession,
	): void {
		const closureIsAlreadyStale =
			this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
			this.#options.publisher.state.status === RpcStateStatusEnum.closed ||
			(expectedSession !== undefined && !this.#record.owns(expectedSession));
		if (closureIsAlreadyStale) {
			continueAfterClose?.();
			return;
		}
		this.#options.lifecycle.ensureTermination();
		this.#options.publisher.enqueue(() => {
			const terminationAlreadyStarted =
				this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
				this.#options.publisher.state.status === RpcStateStatusEnum.closed ||
				(expectedSession !== undefined && !this.#record.owns(expectedSession));
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
		this.#options.lifecycle.ensureTermination();
		const finalState = change.state;
		return {
			publication: {
				state: { status: RpcStateStatusEnum.closing },
				peerStates: [{ peer: this.peer, state: finalState, terminal: true }],
				events: [
					withPeer(this.peer, change.lifecycle),
					{ type: RpcEventTypeEnum.ownerClosing },
				],
			},
			apply: (commitSnapshots) => {
				this.#options.lifecycle.abortCurrentAttempt();
				beforeSnapshots?.();
				this.#releaseSession();
				commitSnapshots();
				return () => {
					try {
						this.#options.lifecycle.startCleanup(finalState);
					} finally {
						continueAfterClose?.();
					}
				};
			},
		};
	}
}

class RpcConnectorSessionAttachmentImpl
	implements IRpcConnectorSessionAttachment
{
	readonly #readActive: () => boolean;
	readonly #activate: (canActivate: () => boolean) => boolean;
	readonly #discard: () => void;
	readonly host: IRpcProtocolSessionHost;

	constructor(
		host: IRpcProtocolSessionHost,
		readActive: () => boolean,
		activate: (canActivate: () => boolean) => boolean,
		discard: () => void,
	) {
		this.host = host;
		this.#readActive = readActive;
		this.#activate = activate;
		this.#discard = discard;
	}

	get active(): boolean {
		return this.#readActive();
	}

	activate(canActivate: () => boolean): boolean {
		return this.#activate(canActivate);
	}

	discard(): void {
		this.#discard();
	}
}

/** Owns the complete one-to-many Acceptor Session registry and Peer transaction sequence. */
export class RpcAcceptorSessionOwnershipImpl
	implements IRpcAcceptorSessionOwnership
{
	readonly #options: CreateRpcAcceptorSessionOwnershipOptions;
	readonly #dependencies: RpcSessionOwnershipDependencies;
	readonly #sessions = new Map<IRpcProtocolSession, RpcSessionRecord>();
	readonly #staleSignals = new WeakSet<object>();
	#insideOwnerFault = false;

	constructor(
		options: CreateRpcAcceptorSessionOwnershipOptions,
		dependencies: RpcSessionOwnershipDependencies,
	) {
		this.#options = options;
		this.#dependencies = dependencies;
	}

	admit(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined {
		const cannotAdmitSession =
			this.#options.publisher.state.status !== RpcStateStatusEnum.active ||
			this.#options.publisher.processing ||
			this.#insideOwnerFault ||
			!this.#options.lifecycle.canAdmitSession() ||
			this.#sessions.size >= this.#options.maximumSessions ||
			this.#sessions.has(session) ||
			!isProtocolSession(session);
		if (cannotAdmitSession) {
			return undefined;
		}

		let admittedHost: IRpcProtocolSessionHost | undefined;
		this.#options.publisher.enqueue(() => {
			const admissionBecameStale =
				this.#options.publisher.state.status !== RpcStateStatusEnum.active ||
				this.#insideOwnerFault ||
				!this.#options.lifecycle.canAdmitSession() ||
				this.#sessions.size >= this.#options.maximumSessions ||
				this.#sessions.has(session);
			if (admissionBecameStale) {
				return undefined;
			}
			let record!: RpcSessionRecord;
			record = new RpcSessionRecord(
				{
					initialPeerState: { status: RpcStateStatusEnum.connected },
					registerPeer: (initialState, build) =>
						this.#options.publisher.registerPeer(initialState, build),
					callEventSink: this.#options.publisher.callEventSink,
					peerEnvironment: this.#options.peerEnvironment,
					readPeerSession: (retainedSession) => retainedSession,
					onTransition: (retainedSession, transition) =>
						this.#transition(record, retainedSession, transition),
					onFault: (retainedSession, reason, error) =>
						this.#fault(record, retainedSession, reason, error),
					onPeerProtocolFault: (retainedSession, error) => {
						if (retainedSession !== undefined) {
							this.#fault(
								record,
								retainedSession,
								RpcCloseReasonEnum.protocolFault,
								error,
							);
						}
					},
				},
				this.#dependencies,
			);
			const sessionHost = record.attach(session);
			if (sessionHost === undefined) {
				return undefined;
			}
			return {
				publication: {
					peers: [...this.#options.publisher.peers, record.peer],
					events: [{ type: RpcEventTypeEnum.peerOpened, peer: record.peer }],
				},
				apply: (commitSnapshots) => {
					this.#sessions.set(session, record);
					admittedHost = sessionHost;
					commitSnapshots();
					return undefined;
				},
			};
		});
		return admittedHost;
	}

	hasLocalExposure(wireName: string): boolean {
		return [...this.#sessions.values()].some((record) =>
			record.hasLocalExposure(wireName),
		);
	}

	beginGracefulShutdown(): void {
		this.#options.publisher.enqueue(() => {
			if (this.#options.publisher.state.status !== RpcStateStatusEnum.active) {
				return undefined;
			}
			const peerEvents: RpcEvent[] = [];
			const peerStates: RpcPeerStatePublication[] = [];
			const terminalRecords: RpcSessionRecord[] = [];
			const terminalPeers: IRpcPeer[] = [];
			for (const record of this.#sessions.values()) {
				const peer = record.peer;
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
					terminalRecords.push(record);
					terminalPeers.push(peer);
					peerEvents.push({
						type: RpcEventTypeEnum.peerClosed,
						peer,
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					});
				}
			}
			const terminalSet = new Set(terminalPeers);
			const peers =
				terminalPeers.length === 0
					? undefined
					: this.#options.publisher.peers.filter(
							(peer) => !terminalSet.has(peer),
						);
			return {
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					peers,
					peerStates,
					events: [{ type: RpcEventTypeEnum.ownerDraining }, ...peerEvents],
				},
				apply: (commitSnapshots) => {
					const terminals = terminalRecords.flatMap((record) => {
						const session = record.session;
						if (session === undefined) {
							return [];
						}
						return [{ record, session, releaseFence: record.fence(session) }];
					});
					for (const { session } of terminals) {
						forceSession(session);
					}
					for (const { record, session } of terminals) {
						this.#release(record, session);
					}
					for (const { releaseFence } of terminals) {
						releaseFence?.();
					}
					commitSnapshots();
					this.#options.lifecycle.abortListener();
					return this.#options.lifecycle.continueGracefulShutdown;
				},
			};
		});
	}

	beginClosing(reason: RpcOwnerCloseReason, forced: boolean): void {
		this.#options.publisher.enqueue(() => {
			const terminationAlreadyStarted =
				this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
				this.#options.publisher.state.status === RpcStateStatusEnum.closed;
			if (terminationAlreadyStarted) {
				return undefined;
			}
			const terminalRecords = [...this.#sessions.values()];
			const peerClosures = this.#createRemainingPeerMutations(reason);
			const finalState = Object.freeze<RpcAcceptorClosedState>({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
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
					this.#options.lifecycle.clearGraceTimer();
					const releaseFences = terminalRecords.flatMap((record) => {
						const session = record.session;
						const release =
							session === undefined ? undefined : record.fence(session);
						return release === undefined ? [] : [release];
					});
					for (const record of terminalRecords) {
						this.#release(record);
					}
					commitSnapshots();
					this.#options.lifecycle.abortListener();
					if (forced) {
						closeProtocol(this.#options.protocol);
					}
					for (const releaseFence of releaseFences) {
						releaseFence();
					}
					return () => this.#options.lifecycle.startCleanup(finalState);
				},
			};
		});
	}

	protocolFault(reason: RpcProtocolFaultReason, error: Error): void {
		const ownerIsTerminal =
			this.#insideOwnerFault ||
			this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
			this.#options.publisher.state.status === RpcStateStatusEnum.closed;
		if (ownerIsTerminal) {
			return;
		}
		this.#options.lifecycle.ensureTermination();
		const faultError = createRpcException(RpcExceptionCodeEnum.protocol, error);
		const releaseSessionFences = [...this.#sessions.values()].flatMap(
			(record) => {
				const session = record.session;
				const release =
					session === undefined ? undefined : record.fence(session);
				return release === undefined ? [] : [release];
			},
		);
		this.#insideOwnerFault = true;
		const releaseFaultFence = (): void => {
			this.#insideOwnerFault = false;
			for (const releaseSessionFence of releaseSessionFences) {
				releaseSessionFence();
			}
		};
		this.#options.publisher.enqueue(() => {
			const faultBecameStale =
				this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
				this.#options.publisher.state.status === RpcStateStatusEnum.closed;
			if (faultBecameStale) {
				releaseFaultFence();
				return undefined;
			}
			const terminalRecords = [...this.#sessions.values()];
			const terminalPeers = terminalRecords.map((record) => record.peer);
			const finalState = Object.freeze<RpcAcceptorClosedState>({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.failed,
				reason,
				error: faultError,
			});
			return {
				publication: {
					state: { status: RpcStateStatusEnum.closing },
					peers: this.#options.publisher.peers.length > 0 ? [] : undefined,
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
					this.#options.lifecycle.clearGraceTimer();
					this.#options.lifecycle.abortListener();
					closeProtocol(this.#options.protocol);
					for (const record of terminalRecords) {
						this.#release(record);
					}
					commitSnapshots();
					return () => {
						try {
							this.#options.lifecycle.startCleanup(finalState);
						} finally {
							releaseFaultFence();
						}
					};
				},
			};
		});
	}

	#transition(
		record: RpcSessionRecord,
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	): void {
		this.#options.publisher.enqueue(() => {
			if (this.#insideOwnerFault || record.isFenced(session)) {
				return undefined;
			}
			const ownerIsTerminal =
				this.#options.publisher.state.status === RpcStateStatusEnum.closing ||
				this.#options.publisher.state.status === RpcStateStatusEnum.closed;
			if (ownerIsTerminal) {
				return undefined;
			}
			if (this.#sessions.get(session) !== record) {
				this.#signalStale(session);
				return undefined;
			}
			const decision = resolveSessionTransition(
				this.#options.publisher.state.status,
				record.peer.state,
				transition,
			);
			if (decision.kind === "fault") {
				this.#fault(record, session, decision.reason, decision.error);
				return undefined;
			}
			if (decision.terminal) {
				this.#close(record, session, decision);
				return undefined;
			}
			return {
				publication: {
					peerStates: [{ peer: record.peer, state: decision.state }],
					events: [withPeer(record.peer, decision.lifecycle)],
				},
			};
		});
	}

	#fault(
		record: RpcSessionRecord,
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	): void {
		if (record.isFenced(session)) {
			return;
		}
		const releaseFence = record.fence(session);
		if (releaseFence === undefined) {
			if (this.#sessions.get(session) !== record) {
				this.#signalStale(session);
			}
			return;
		}
		this.#close(
			record,
			session,
			resolveSessionClosure(reason, error),
			() => forceSession(session),
			releaseFence,
		);
	}

	#close(
		record: RpcSessionRecord,
		session: IRpcProtocolSession,
		change: RpcSessionTerminalChange,
		beforeSnapshots?: () => void,
		continueAfterClose?: () => void,
	): void {
		this.#options.publisher.enqueue(() => {
			if (
				this.#sessions.get(session) !== record ||
				record.peer.state.status === RpcStateStatusEnum.closed
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
			return {
				publication: {
					peers: this.#options.publisher.peers.filter(
						(candidate) => candidate !== record.peer,
					),
					peerStates: [
						{ peer: record.peer, state: change.state, terminal: true },
					],
					events: [withPeer(record.peer, change.lifecycle)],
				},
				apply: (commitSnapshots) => {
					beforeSnapshots?.();
					this.#release(record, session);
					commitSnapshots();
					return continueAfterClose;
				},
			};
		});
	}

	#createRemainingPeerMutations(reason: RpcOwnerCloseReason): {
		readonly events: readonly RpcEvent[];
		readonly peerStates: readonly RpcPeerStatePublication[];
		readonly peersChanged: boolean;
	} {
		const events: RpcEvent[] = [];
		const peerStates: RpcPeerStatePublication[] = [];
		const peersChanged = this.#options.publisher.peers.length > 0;
		for (const record of this.#sessions.values()) {
			const peer = record.peer;
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
				events.push({
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
				events.push({
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				});
			}
		}
		return { events, peerStates, peersChanged };
	}

	#release(record: RpcSessionRecord, expected?: IRpcProtocolSession): void {
		const session = record.session;
		if (
			session !== undefined &&
			(expected === undefined || session === expected) &&
			this.#sessions.get(session) === record
		) {
			this.#sessions.delete(session);
			record.release(session);
		}
	}

	#signalStale(session: IRpcProtocolSession): void {
		if (this.#staleSignals.has(session)) {
			return;
		}
		this.#staleSignals.add(session);
		forceSession(session);
	}
}

type RpcSessionOwnershipDependencies = Readonly<{
	readonly createPeer: RpcPeerFactory;
}>;

type CreateRpcSessionRecordOptions = Readonly<{
	readonly initialPeerState: RpcPeerState;
	readonly registerPeer: (
		initialState: RpcPeerState,
		build: (stateView: RpcPeerStateView) => IRpcPeerHost,
	) => IRpcPeerHost;
	readonly callEventSink: RpcCallEventSink;
	readonly peerEnvironment: RpcSessionPeerEnvironment;
	readonly readPeerSession: (
		session: IRpcProtocolSession | undefined,
	) => IRpcProtocolSession | undefined;
	readonly onTransition: (
		session: IRpcProtocolSession,
		transition: RpcProtocolSessionTransition,
	) => void;
	readonly onFault: (
		session: IRpcProtocolSession,
		reason: RpcProtocolFaultReason,
		error: Error,
	) => void;
	readonly onPeerProtocolFault: (
		session: IRpcProtocolSession | undefined,
		error: Error,
	) => void;
}>;

class RpcSessionRecord {
	readonly #host: IRpcPeerHost;
	readonly #onTransition: CreateRpcSessionRecordOptions["onTransition"];
	readonly #onFault: CreateRpcSessionRecordOptions["onFault"];
	#session: IRpcProtocolSession | undefined;
	#faultFence: IRpcProtocolSession | undefined;

	constructor(
		options: CreateRpcSessionRecordOptions,
		dependencies: RpcSessionOwnershipDependencies,
	) {
		this.#onTransition = options.onTransition;
		this.#onFault = options.onFault;
		this.#host = options.registerPeer(
			options.initialPeerState,
			({ readState, state$ }) =>
				dependencies.createPeer({
					readState,
					state$,
					getSession: () => options.readPeerSession(this.#session),
					findOwnerExposure: options.peerEnvironment.findOwnerExposure,
					isOwnerActive: options.peerEnvironment.isOwnerActive,
					callEventSink: options.callEventSink,
					onProtocolFault: (error) =>
						options.onPeerProtocolFault(this.#session, error),
					handlerScheduler: options.peerEnvironment.handlerScheduler,
					maximumIncomingBytes: options.peerEnvironment.maximumIncomingBytes,
					reserveRetainedBytes: (bytes) =>
						reserveRpcSessionRetainedBytes(
							this.#session,
							options.peerEnvironment.reserveOwnerRetainedBytes,
							bytes,
						),
				}),
		);
	}

	get peer(): IRpcPeer {
		return this.#host.peer;
	}

	get session(): IRpcProtocolSession | undefined {
		return this.#session;
	}

	attach(session: IRpcProtocolSession): IRpcProtocolSessionHost | undefined {
		if (this.#session !== undefined || !isProtocolSession(session)) {
			return undefined;
		}
		this.#session = session;
		return Object.freeze<IRpcProtocolSessionHost>({
			reserveIncomingCall: (request, consume) =>
				this.#host.reserveIncomingCall(request, consume),
			transition: (transition) => this.#onTransition(session, transition),
			fault: (reason, error) => this.#onFault(session, reason, error),
		});
	}

	hasLocalExposure(wireName: string): boolean {
		return this.#host.hasLocalExposure(wireName);
	}

	owns(session: IRpcProtocolSession): boolean {
		return this.#session === session;
	}

	isFenced(session: IRpcProtocolSession): boolean {
		return this.#faultFence === session;
	}

	fence(session: IRpcProtocolSession): (() => void) | undefined {
		if (!this.owns(session) || this.#faultFence !== undefined) {
			return undefined;
		}
		this.#faultFence = session;
		let active = true;
		return () => {
			if (active && this.#faultFence === session) {
				this.#faultFence = undefined;
			}
			active = false;
		};
	}

	release(session?: IRpcProtocolSession): IRpcProtocolSession | undefined {
		const retained = this.#session;
		if (
			retained === undefined ||
			(session !== undefined && retained !== session)
		) {
			return undefined;
		}
		this.#session = undefined;
		return retained;
	}
}

type RpcSessionOwnerStatus = Extract<
	RpcStateStatusEnum,
	| RpcStateStatusEnum.active
	| RpcStateStatusEnum.draining
	| RpcStateStatusEnum.closing
	| RpcStateStatusEnum.closed
>;

type RpcPeerLifecycleFact = WithoutPeer<RpcPeerLifecycleEvent>;

type RpcSessionTerminalChange = Readonly<{
	readonly kind: "change";
	readonly state: Extract<
		RpcPeerState,
		{ readonly status: RpcStateStatusEnum.closed }
	>;
	readonly lifecycle: Extract<
		RpcPeerLifecycleFact,
		{ readonly type: RpcEventTypeEnum.peerClosed }
	>;
	readonly terminal: true;
}>;

type RpcSessionTransitionDecision = RpcSessionFault | RpcSessionChange;

type RpcSessionFault = Readonly<{
	readonly kind: "fault";
	readonly reason: RpcCloseReasonEnum.protocolFault;
	readonly error: Error;
}>;

type RpcSessionChange = RpcSessionContinuingChange | RpcSessionTerminalChange;

type RpcSessionContinuingChange = Readonly<{
	readonly kind: "change";
	readonly state: Extract<
		RpcPeerState,
		{
			readonly status:
				| RpcStateStatusEnum.recovering
				| RpcStateStatusEnum.connected
				| RpcStateStatusEnum.draining;
		}
	>;
	readonly lifecycle: Exclude<
		RpcPeerLifecycleFact,
		{ readonly type: RpcEventTypeEnum.peerClosed }
	>;
	readonly terminal: false;
}>;

type RpcPeerLifecycleEvent = Extract<
	DistributeEventTypes<RpcEvent>,
	{
		readonly type:
			| RpcEventTypeEnum.peerRecovering
			| RpcEventTypeEnum.peerRecovered
			| RpcEventTypeEnum.peerDraining
			| RpcEventTypeEnum.peerClosed;
	}
>;

type DistributeEventTypes<TEvent> = TEvent extends {
	readonly type: infer TType;
}
	? TType extends RpcEventTypeEnum
		? Omit<TEvent, "type"> & Readonly<{ readonly type: TType }>
		: never
	: never;

type WithoutPeer<TEvent> = TEvent extends RpcPeerLifecycleEvent
	? Omit<TEvent, "peer">
	: never;

type RpcConnectorPeerClosedState = Extract<
	RpcPeerState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcPeerClosedEvent = Extract<
	RpcEvent,
	{ readonly type: RpcEventTypeEnum.peerClosed }
>;

type RpcAcceptorClosedState = Extract<
	RpcAcceptorState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

function resolveSessionTransition(
	ownerStatus: RpcSessionOwnerStatus,
	peerState: RpcPeerState,
	transition: RpcProtocolSessionTransition,
): RpcSessionTransitionDecision {
	if (!canTransitionSession(ownerStatus, peerState, transition)) {
		return {
			kind: "fault",
			reason: RpcCloseReasonEnum.protocolFault,
			error: new Error("Protocol requested an invalid Session transition."),
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
		return {
			kind: "change",
			state: { status: RpcStateStatusEnum.recovering },
			lifecycle: { type: RpcEventTypeEnum.peerRecovering },
			terminal: false,
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
		return {
			kind: "change",
			state: { status: RpcStateStatusEnum.connected },
			lifecycle: { type: RpcEventTypeEnum.peerRecovered },
			terminal: false,
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
		return {
			kind: "change",
			state: {
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
			lifecycle: {
				type: RpcEventTypeEnum.peerDraining,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
			terminal: false,
		};
	}
	return resolveSessionClosure(transition.reason, transition.cause);
}

function resolveSessionClosure(
	reason: RpcSessionCloseReason,
	cause?: Error,
): RpcSessionTerminalChange {
	switch (reason) {
		case RpcCloseReasonEnum.recoveryExpired:
		case RpcCloseReasonEnum.counterExhaustion:
			return createUnavailableSessionChange(reason, cause);
		case RpcCloseReasonEnum.continuityFailure:
		case RpcCloseReasonEnum.protocolFault:
		case RpcCloseReasonEnum.resourceFault:
			return createProtocolSessionChange(reason, cause);
		case RpcCloseReasonEnum.gracefulShutdown:
		case RpcCloseReasonEnum.forcedClose:
		case RpcCloseReasonEnum.shutdownDeadline:
		case RpcCloseReasonEnum.remoteTerminated:
			return {
				kind: "change",
				state: {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				},
				lifecycle: {
					type: RpcEventTypeEnum.peerClosed,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				},
				terminal: true,
			};
		default:
			return assertNeverSessionCloseReason(reason);
	}
}

function canTransitionSession(
	ownerStatus: RpcSessionOwnerStatus,
	peerState: RpcPeerState,
	transition: RpcProtocolSessionTransition,
): boolean {
	if (ownerStatus === RpcStateStatusEnum.draining) {
		return (
			transition.type === RpcProtocolSessionTransitionTypeEnum.closed &&
			peerState.status === RpcStateStatusEnum.draining &&
			transition.reason !== RpcCloseReasonEnum.recoveryExpired &&
			(transition.reason !== RpcCloseReasonEnum.counterExhaustion ||
				peerState.reason === RpcCloseReasonEnum.counterExhaustion)
		);
	}
	if (ownerStatus !== RpcStateStatusEnum.active) {
		return false;
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
		return peerState.status === RpcStateStatusEnum.connected;
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
		return peerState.status === RpcStateStatusEnum.recovering;
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
		return (
			peerState.status === RpcStateStatusEnum.connected ||
			peerState.status === RpcStateStatusEnum.recovering
		);
	}
	if (transition.reason === RpcCloseReasonEnum.recoveryExpired) {
		return peerState.status === RpcStateStatusEnum.recovering;
	}
	if (transition.reason === RpcCloseReasonEnum.counterExhaustion) {
		return (
			peerState.status === RpcStateStatusEnum.draining &&
			peerState.reason === RpcCloseReasonEnum.counterExhaustion
		);
	}
	return transition.reason !== RpcCloseReasonEnum.gracefulShutdown;
}

function createUnavailableSessionChange(
	reason:
		| RpcCloseReasonEnum.recoveryExpired
		| RpcCloseReasonEnum.counterExhaustion,
	cause: Error | undefined,
): RpcSessionTerminalChange {
	return {
		kind: "change",
		state: {
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
			error: createRpcException(RpcExceptionCodeEnum.unavailable, cause),
		},
		lifecycle: {
			type: RpcEventTypeEnum.peerClosed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
		},
		terminal: true,
	};
}

function createProtocolSessionChange(
	reason:
		| RpcCloseReasonEnum.continuityFailure
		| RpcCloseReasonEnum.protocolFault
		| RpcCloseReasonEnum.resourceFault,
	cause: Error | undefined,
): RpcSessionTerminalChange {
	return {
		kind: "change",
		state: {
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
			error: createRpcException(RpcExceptionCodeEnum.protocol, cause),
		},
		lifecycle: {
			type: RpcEventTypeEnum.peerClosed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
		},
		terminal: true,
	};
}

function createConnectorPeerClosure(
	peer: IRpcPeer,
	reason: RpcOwnerCloseReason,
): {
	readonly finalState: RpcConnectorPeerClosedState;
	readonly event?: RpcPeerClosedEvent;
} {
	const peerState = peer.state;
	if (peerState.status === RpcStateStatusEnum.closed) {
		return {
			finalState: Object.freeze({
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason,
			}),
		};
	}
	if (
		reason === RpcCloseReasonEnum.gracefulShutdown &&
		peerState.status === RpcStateStatusEnum.draining &&
		peerState.reason === RpcCloseReasonEnum.counterExhaustion
	) {
		const finalState = Object.freeze<RpcConnectorPeerClosedState>({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.counterExhaustion,
			error: createRpcException(RpcExceptionCodeEnum.unavailable),
		});
		return {
			finalState,
			event: {
				type: RpcEventTypeEnum.peerClosed,
				peer,
				outcome: RpcCloseOutcomeEnum.failed,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
		};
	}
	const finalState = Object.freeze<RpcConnectorPeerClosedState>({
		status: RpcStateStatusEnum.closed,
		outcome: RpcCloseOutcomeEnum.normal,
		reason,
	});
	return {
		finalState,
		event: {
			type: RpcEventTypeEnum.peerClosed,
			peer,
			outcome: RpcCloseOutcomeEnum.normal,
			reason,
		},
	};
}

function withPeer(peer: IRpcPeer, lifecycle: RpcPeerLifecycleFact): RpcEvent {
	return { ...lifecycle, peer };
}

function closeProtocol(protocol: { close(): void }): void {
	try {
		protocol.close();
	} catch {
		// The initiating fault or Owner close remains authoritative.
	}
}

function forceSession(session: IRpcProtocolSession): void {
	try {
		session.forceClose();
	} catch {
		// The initiating fault or Owner close remains authoritative.
	}
}

function assertNeverSessionCloseReason(reason: never): never {
	throw new Error(`Unsupported Session close reason: ${String(reason)}.`);
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
