/**
 * @overview Derives the example's RPC and manual transport control availability.
 * @author AEPKILL
 * @created 2026-08-23 01:08:57
 */

import { RpcStateStatusEnum } from "@husky-di/remote";

export function getRpcControlAvailability(
	peerStatus: RpcStateStatusEnum,
	manualRecoveryReady: boolean,
	operationPending: boolean,
): {
	readonly call: boolean;
	readonly disconnect: boolean;
	readonly recover: boolean;
} {
	return {
		call:
			peerStatus === RpcStateStatusEnum.connected ||
			peerStatus === RpcStateStatusEnum.recovering,
		disconnect:
			peerStatus === RpcStateStatusEnum.connected &&
			!manualRecoveryReady &&
			!operationPending,
		recover:
			peerStatus === RpcStateStatusEnum.recovering &&
			manualRecoveryReady &&
			!operationPending,
	};
}
