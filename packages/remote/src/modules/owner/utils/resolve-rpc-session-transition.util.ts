/**
 * @overview Validates Session transitions and projects correlated Peer state and lifecycle events.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { RpcOwnerCloseReason } from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import type { RpcEvent } from "@/modules/owner/types/rpc-event.type";
import type {
	RpcPeerLifecycleFact,
	RpcSessionChange,
	RpcSessionOwnerStatus,
	RpcSessionTerminalChange,
	RpcSessionTransitionDecision,
} from "@/modules/owner/types/rpc-session-transition.type";
import type { IRpcPeer, RpcPeerState } from "@/modules/peer";
import type {
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/modules/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol";
import { RpcCloseOutcomeEnum } from "@/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";

export function resolveSessionTransition(
	ownerStatus: RpcSessionOwnerStatus,
	peerState: RpcPeerState,
	transition: RpcProtocolSessionTransition,
): RpcSessionTransitionDecision {
	if (!canTransitionSession(ownerStatus, peerState, transition)) {
		return {
			reason: RpcCloseReasonEnum.protocolFault,
			error: new Error("Protocol requested an invalid Session transition."),
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
		return {
			state: { status: RpcStateStatusEnum.recovering },
			lifecycle: { type: RpcEventTypeEnum.peerRecovering },
			terminal: false,
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
		return {
			state: { status: RpcStateStatusEnum.connected },
			lifecycle: { type: RpcEventTypeEnum.peerRecovered },
			terminal: false,
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
		return {
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

export function resolveSessionClosure(
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

export function createRpcPeerClosure(
	peer: IRpcPeer,
	reason: RpcOwnerCloseReason,
): {
	readonly finalState: RpcPeerClosedState;
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
	const change = resolveOwnerPeerClosure(peerState, reason);
	return {
		finalState: Object.freeze(change.state),
		event: { ...change.lifecycle, peer },
	};
}

/** Resolves a retained Peer terminal under Owner cutoff without suppressing publication. */
export function resolveOwnerPeerClosure(
	peerState: RpcPeerState,
	reason: RpcOwnerCloseReason,
): RpcSessionTerminalChange {
	const counterDrainFailedDuringShutdown =
		reason === RpcCloseReasonEnum.gracefulShutdown &&
		peerState.status === RpcStateStatusEnum.draining &&
		peerState.reason === RpcCloseReasonEnum.counterExhaustion;
	return resolveSessionClosure(
		counterDrainFailedDuringShutdown
			? RpcCloseReasonEnum.counterExhaustion
			: reason,
	);
}

export function withPeer(
	peer: IRpcPeer,
	lifecycle: RpcPeerLifecycleFact,
): RpcEvent {
	return { ...lifecycle, peer };
}

/** Projects the graceful cutoff shared by both roles without applying effects. */
export function resolvePeerGracefulChange(
	peerState: RpcPeerState,
): RpcSessionChange | undefined {
	if (peerState.status === RpcStateStatusEnum.connected) {
		return {
			state: {
				status: RpcStateStatusEnum.draining,
				reason: RpcCloseReasonEnum.gracefulShutdown,
			},
			lifecycle: {
				type: RpcEventTypeEnum.peerDraining,
				reason: RpcCloseReasonEnum.gracefulShutdown,
			},
			terminal: false,
		};
	}
	if (peerState.status === RpcStateStatusEnum.recovering) {
		return resolveSessionClosure(RpcCloseReasonEnum.forcedClose);
	}

	return undefined;
}

type RpcPeerClosedState = Extract<
	RpcPeerState,
	{ readonly status: RpcStateStatusEnum.closed }
>;

type RpcPeerClosedEvent = Extract<
	RpcEvent,
	{ readonly type: RpcEventTypeEnum.peerClosed }
>;

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

function assertNeverSessionCloseReason(reason: never): never {
	throw new Error(`Unsupported Session close reason: ${String(reason)}.`);
}
