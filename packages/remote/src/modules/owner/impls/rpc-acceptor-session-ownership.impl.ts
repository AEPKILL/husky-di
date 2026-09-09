/**
 * @overview Owns Acceptor Session admission, membership, and terminal publication transactions.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { createRpcSessionRecord } from "@/modules/owner/factories/rpc-session-record.factory";
import type {
	IRpcAcceptorSessionOwnership,
	RpcAcceptorSessionOwnershipFactory,
	RpcOwnerCloseReason,
} from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import type { IRpcSessionRecord } from "@/modules/owner/interfaces/rpc-session-record.interface";
import type { RpcAcceptorClosedState } from "@/modules/owner/types/rpc-caller.type";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type { RpcPeerStatePublication } from "@/modules/owner/types/rpc-owner-publication.type";
import type { RpcSessionOwnershipDependencies } from "@/modules/owner/types/rpc-session-ownership.type";
import type { RpcSessionTerminalChange } from "@/modules/owner/types/rpc-session-transition.type";
import {
	closeProtocol,
	fenceRpcSessions,
	forceSession,
	isProtocolSession,
} from "@/modules/owner/utils/manage-rpc-session.util";
import {
	resolveOwnerPeerClosure,
	resolvePeerGracefulChange,
	resolveSessionClosure,
	resolveSessionTransition,
	withPeer,
} from "@/modules/owner/utils/resolve-rpc-session-transition.util";
import type { IRpcPeer } from "@/modules/peer";
import type {
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	RpcProtocolFaultReason,
	RpcProtocolSessionTransition,
} from "@/modules/protocol";
import { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";

export type CreateRpcAcceptorSessionOwnershipOptions =
	Parameters<RpcAcceptorSessionOwnershipFactory>[0];

/** Owns the complete one-to-many Acceptor Session registry and Peer transaction sequence. */
export class RpcAcceptorSessionOwnershipImpl
	implements IRpcAcceptorSessionOwnership
{
	readonly #options: CreateRpcAcceptorSessionOwnershipOptions;
	readonly #dependencies: RpcSessionOwnershipDependencies;
	readonly #sessions = new Map<IRpcProtocolSession, IRpcSessionRecord>();
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
			let record!: IRpcSessionRecord;
			record = createRpcSessionRecord(
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
			const terminalRecords: IRpcSessionRecord[] = [];
			const terminalPeers: IRpcPeer[] = [];
			for (const record of this.#sessions.values()) {
				const peer = record.peer;
				const change = resolvePeerGracefulChange(peer.state);
				if (change === undefined) {
					continue;
				}
				peerStates.push({
					peer,
					state: change.state,
					terminal: change.terminal,
				});
				peerEvents.push(withPeer(peer, change.lifecycle));
				if (change.terminal) {
					terminalRecords.push(record);
					terminalPeers.push(peer);
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
					const continueGrace = this.#options.termination.enterGrace();
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
					const continueClosing =
						this.#options.termination.enterClosing(finalState);
					const releaseFences = fenceRpcSessions(terminalRecords);
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
					return continueClosing;
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
		this.#options.termination.ensureTermination();
		const faultError = createRpcException(RpcExceptionCodeEnum.protocol, error);
		const releaseSessionFences = fenceRpcSessions(this.#sessions.values());
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
					const continueClosing =
						this.#options.termination.enterClosing(finalState);
					this.#options.lifecycle.abortListener();
					closeProtocol(this.#options.protocol);
					for (const record of terminalRecords) {
						this.#release(record);
					}
					commitSnapshots();
					return () => {
						try {
							continueClosing();
						} finally {
							releaseFaultFence();
						}
					};
				},
			};
		});
	}

	#transition(
		record: IRpcSessionRecord,
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
			if ("error" in decision) {
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
		record: IRpcSessionRecord,
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
		record: IRpcSessionRecord,
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
			const closure = resolveOwnerPeerClosure(peer.state, reason);
			peerStates.push({ peer, state: closure.state, terminal: true });
			events.push(withPeer(peer, closure.lifecycle));
		}
		return { events, peerStates, peersChanged };
	}

	#release(record: IRpcSessionRecord, expected?: IRpcProtocolSession): void {
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
