/**
 * @overview Projects Logical Session intents into matching Peer state and lifecycle facts.
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
import type { IRpcPeerRuntime } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type {
	RpcProtocolSessionTransition,
	RpcSessionCloseReason,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/common/rpc-caller.type";
import type {
	RpcSessionClosureProjectionIntent,
	RpcSessionOwnerStatus,
	RpcSessionProjection,
	RpcSessionProjectionIntent,
	RpcSessionTerminalProjection,
	RpcSessionTransitionProjectionIntent,
} from "@/types/owner/rpc-session-projection.type";

/** Projects one exact owned Session intent without applying role-specific ownership. */
export function projectRpcSession(
	peer: IRpcPeerRuntime,
	intent: RpcSessionClosureProjectionIntent,
): RpcSessionTerminalProjection;
export function projectRpcSession(
	peer: IRpcPeerRuntime,
	intent: RpcSessionTransitionProjectionIntent,
): RpcSessionProjection;
export function projectRpcSession(
	peer: IRpcPeerRuntime,
	intent: RpcSessionProjectionIntent,
): RpcSessionProjection {
	if (intent.kind === "closure") {
		return createSessionClosureProjection(peer, intent.reason, intent.cause);
	}

	const { ownerStatus, transition } = intent;
	if (!canProjectRpcSessionTransition(ownerStatus, peer.state, transition)) {
		return {
			kind: "invalid",
			fault: {
				reason: RpcCloseReasonEnum.protocolFault,
				error: new Error("Protocol requested an invalid Session transition."),
			},
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovering) {
		return {
			kind: "commit",
			peerMutation: {
				peer,
				state: { status: RpcStateStatusEnum.recovering },
			},
			event: { type: RpcEventTypeEnum.peerRecovering, peer },
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.recovered) {
		return {
			kind: "commit",
			peerMutation: {
				peer,
				state: { status: RpcStateStatusEnum.connected },
			},
			event: { type: RpcEventTypeEnum.peerRecovered, peer },
		};
	}
	if (transition.type === RpcProtocolSessionTransitionTypeEnum.draining) {
		return {
			kind: "commit",
			peerMutation: {
				peer,
				state: {
					status: RpcStateStatusEnum.draining,
					reason: RpcCloseReasonEnum.counterExhaustion,
				},
			},
			event: {
				type: RpcEventTypeEnum.peerDraining,
				peer,
				reason: RpcCloseReasonEnum.counterExhaustion,
			},
		};
	}
	return createSessionClosureProjection(
		peer,
		transition.reason,
		transition.cause,
	);
}

/** Narrows a committed projection to its correlated terminal state and event. */
export function isRpcSessionTerminalProjection(
	projection: RpcSessionProjection,
): projection is RpcSessionTerminalProjection {
	return (
		projection.kind === "commit" && projection.peerMutation.terminal === true
	);
}

function createSessionClosureProjection(
	peer: IRpcPeerRuntime,
	reason: RpcSessionCloseReason,
	cause?: Error,
): RpcSessionTerminalProjection {
	switch (reason) {
		case RpcCloseReasonEnum.recoveryExpired:
		case RpcCloseReasonEnum.counterExhaustion: {
			const error = createRpcException(RpcExceptionCodeEnum.unavailable, cause);
			return {
				kind: "commit",
				peerMutation: {
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.failed,
						reason,
						error,
					},
					terminal: true,
				},
				event: {
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
				},
			};
		}
		case RpcCloseReasonEnum.continuityFailure:
		case RpcCloseReasonEnum.protocolFault:
		case RpcCloseReasonEnum.resourceFault: {
			const error = createRpcException(RpcExceptionCodeEnum.protocol, cause);
			return {
				kind: "commit",
				peerMutation: {
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.failed,
						reason,
						error,
					},
					terminal: true,
				},
				event: {
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.failed,
					reason,
				},
			};
		}
		case RpcCloseReasonEnum.gracefulShutdown:
		case RpcCloseReasonEnum.forcedClose:
		case RpcCloseReasonEnum.shutdownDeadline:
		case RpcCloseReasonEnum.remoteTerminated:
			return {
				kind: "commit",
				peerMutation: {
					peer,
					state: {
						status: RpcStateStatusEnum.closed,
						outcome: RpcCloseOutcomeEnum.normal,
						reason,
					},
					terminal: true,
				},
				event: {
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason,
				},
			};
		default:
			return assertNeverSessionCloseReason(reason);
	}
}

function canProjectRpcSessionTransition(
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
