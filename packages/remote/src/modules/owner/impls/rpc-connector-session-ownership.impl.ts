/**
 * @overview Owns Connector Session attachment, activation, and terminal publication transactions.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { createRpcSessionRecord } from "@/modules/owner/factories/rpc-session-record.factory";
import type {
	IRpcConnectorSessionAttachment,
	IRpcConnectorSessionOwnership,
	RpcConnectorSessionOwnershipFactory,
	RpcOwnerCloseReason,
} from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import type { IRpcSessionRecord } from "@/modules/owner/interfaces/rpc-session-record.interface";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcConnectorCommit } from "@/modules/owner/types/rpc-owner-publication.type";
import type { RpcSessionOwnershipDependencies } from "@/modules/owner/types/rpc-session-ownership.type";
import type { RpcSessionTerminalChange } from "@/modules/owner/types/rpc-session-transition.type";
import {
	closeProtocol,
	forceSession,
} from "@/modules/owner/utils/manage-rpc-session.util";
import {
	createRpcPeerClosure,
	resolvePeerGracefulChange,
	resolveSessionClosure,
	resolveSessionTransition,
	withPeer,
} from "@/modules/owner/utils/resolve-rpc-session-transition.util";
import type { IRpcPeer } from "@/modules/peer";
import type {
	IRpcProtocolSession,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "@/modules/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";

export type CreateRpcConnectorSessionOwnershipOptions =
	Parameters<RpcConnectorSessionOwnershipFactory>[0];

/** Owns the complete one-to-one Connector Session and Peer transaction sequence. */
export class RpcConnectorSessionOwnershipImpl
	implements IRpcConnectorSessionOwnership
{
	readonly #options: CreateRpcConnectorSessionOwnershipOptions;
	readonly #record: IRpcSessionRecord;
	#attachment: IRpcConnectorSessionAttachment | undefined;
	#active = false;
	#insideOwnerFault = false;

	constructor(
		options: CreateRpcConnectorSessionOwnershipOptions,
		dependencies: RpcSessionOwnershipDependencies,
	) {
		this.#options = options;
		this.#record = createRpcSessionRecord(
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
		let attachment!: IRpcConnectorSessionAttachment;
		const isActive = () => this.#active && this.#attachment === attachment;
		attachment = {
			host,
			get active() {
				return isActive();
			},
			activate: (canActivate) => this.#activate(attachment, canActivate),
			discard: () => this.#discard(attachment),
		};
		this.#attachment = attachment;
		this.#active = false;
		return attachment;
	}

	#activate(
		attachment: IRpcConnectorSessionAttachment,
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

	#discard(attachment: IRpcConnectorSessionAttachment): void {
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
			const change = peerHasNoSession
				? resolveSessionClosure(RpcCloseReasonEnum.gracefulShutdown)
				: resolvePeerGracefulChange(peerState);
			const nextPeerState = change?.state;
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
			} else if (change?.terminal === true) {
				events.push(withPeer(this.peer, change.lifecycle));
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
										terminal: change?.terminal === true,
									},
								],
					events,
				},
				apply: (commitSnapshots) => {
					const continueGrace = this.#options.termination.enterGrace();
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
					if (change?.terminal === true) {
						this.#releaseSession(session);
					}
					commitSnapshots();
					return continueGrace;
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
			const closure = createRpcPeerClosure(this.peer, reason);
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
					const continueClosing = this.#options.termination.enterClosing(
						closure.finalState,
					);
					this.#options.lifecycle.abortCurrentAttempt();
					this.#releaseSession();
					commitSnapshots();
					if (forced) {
						closeProtocol(this.#options.protocol);
					}
					return continueClosing;
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
			this.#options.termination.ensureTermination();
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
			if ("error" in decision) {
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
		this.#options.termination.ensureTermination();
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
		this.#options.termination.ensureTermination();
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
				const continueClosing =
					this.#options.termination.enterClosing(finalState);
				this.#options.lifecycle.abortCurrentAttempt();
				beforeSnapshots?.();
				this.#releaseSession();
				commitSnapshots();
				return () => {
					try {
						continueClosing();
					} finally {
						continueAfterClose?.();
					}
				};
			},
		};
	}
}
