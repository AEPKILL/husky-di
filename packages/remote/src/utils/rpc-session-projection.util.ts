/**
 * @overview Resolves Logical Session transitions into pure Peer lifecycle changes.
 * @author AEPKILL
 * @created 2026-08-31 01:46:19
 */

import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseOutcomeEnum } from "@/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type {
	RpcSessionChange,
	RpcSessionOwnerStatus,
	RpcSessionTerminalChange,
	RpcSessionTransitionDecision,
} from "@/types/owner/rpc-session-projection.type";

/** Resolves one Protocol transition against current Owner and Peer snapshots. */
export function resolveRpcSessionTransition(
	ownerStatus: RpcSessionOwnerStatus,
	peerState: RpcPeerState,
	transition: RpcProtocolSessionTransition,
): RpcSessionTransitionDecision {
	if (!canTransitionRpcSession(ownerStatus, peerState, transition)) {
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
	return resolveRpcSessionClosure(transition.reason, transition.cause);
}

/** Resolves one Session closure without retaining or mutating a Peer. */
export function resolveRpcSessionClosure(
	reason: RpcSessionCloseReason,
	cause?: Error,
): RpcSessionTerminalChange {
	switch (reason) {
		case RpcCloseReasonEnum.recoveryExpired:
		case RpcCloseReasonEnum.counterExhaustion: {
			const error = createRpcException(RpcExceptionCodeEnum.unavailable, cause);
			return {
				kind: "change",
				state: {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
					error,
				},
				lifecycle: {
					type: RpcEventTypeEnum.peerClosed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
				},
				terminal: true,
			};
		}
		case RpcCloseReasonEnum.continuityFailure:
		case RpcCloseReasonEnum.protocolFault:
		case RpcCloseReasonEnum.resourceFault: {
			const error = createRpcException(RpcExceptionCodeEnum.protocol, cause);
			return {
				kind: "change",
				state: {
					status: RpcStateStatusEnum.closed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
					error,
				},
				lifecycle: {
					type: RpcEventTypeEnum.peerClosed,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
				},
				terminal: true,
			};
		}
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

/** Narrows a Session change to its correlated terminal state and fact. */
export function isRpcSessionTerminalChange(
	change: RpcSessionChange,
): change is RpcSessionTerminalChange {
	return change.terminal;
}

function canTransitionRpcSession(
	ownerStatus: RpcSessionOwnerStatus,
	peerState: RpcPeerState,
	transition: RpcProtocolSessionTransition,
): boolean {
	if (ownerStatus === RpcStateStatusEnum.draining) {
		// A draining Owner accepts only the exact terminal selected by its draining Peer.
		const drainingCloseIsAllowed =
			transition.type === RpcProtocolSessionTransitionTypeEnum.closed &&
			peerState.status === RpcStateStatusEnum.draining &&
			transition.reason !== RpcCloseReasonEnum.recoveryExpired &&
			(transition.reason !== RpcCloseReasonEnum.counterExhaustion ||
				peerState.reason === RpcCloseReasonEnum.counterExhaustion);
		return drainingCloseIsAllowed;
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
		// Counter drain can start from either connected or recovering retention.
		const counterDrainIsAllowed =
			peerState.status === RpcStateStatusEnum.connected ||
			peerState.status === RpcStateStatusEnum.recovering;
		return counterDrainIsAllowed;
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

function assertNeverSessionCloseReason(reason: never): never {
	throw new Error(`Unsupported Session close reason: ${String(reason)}.`);
}
