/**
 * @overview Payload-free example diagnostic snapshots.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	RpcCallDirectionEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";

export type PendingCall = {
	readonly observationId: string;
	readonly direction: RpcCallDirectionEnum;
	readonly service?: string;
	readonly method?: string;
};

export type RpcDiagnosticsSnapshot = {
	readonly totalEvents: number;
	readonly pendingCalls: readonly PendingCall[];
	readonly recentEvents: readonly string[];
};

export type NodeDiagnosticsSnapshot = RpcDiagnosticsSnapshot & {
	readonly ownerStatus: RpcStateStatusEnum;
	readonly listenerStatus: RpcStateStatusEnum;
	readonly peerStatuses: readonly RpcStateStatusEnum[];
};
