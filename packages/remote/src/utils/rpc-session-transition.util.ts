/**
 * @overview Validates Framework Session state projections.
 * @author AEPKILL
 * @created 2026-08-21 21:05:00
 */

import { RpcProtocolSessionTransitionTypeEnum } from "@/enums/protocol/rpc-protocol-session-transition-type.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import type { RpcProtocolSessionTransition } from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcPeerState } from "@/types/rpc-caller.type";

/** Applies the common Owner and Peer transition policy. */
export function isRpcSessionTransitionAllowed(
	ownerStatus: RpcStateStatusEnum,
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
