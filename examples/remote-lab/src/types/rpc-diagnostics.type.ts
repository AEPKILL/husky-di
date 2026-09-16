/**
 * @overview Payload-free example diagnostic snapshots.
 * @author AEPKILL
 * @created 2026-08-21 01:06:59
 */

import type {
	RpcCallDirectionEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import type {
	LabObservedState,
	LabOwnerConfiguration,
} from "@/types/lab-owner.type";

export type PendingCall = {
	readonly peerId?: string;
	readonly startedAt: number;
	readonly observationId: string;
	readonly direction: RpcCallDirectionEnum;
	readonly service?: string;
	readonly method?: string;
};

export type RpcDiagnosticsSnapshot = {
	readonly observedAt: number;
	readonly totalEvents: number;
	readonly pendingCalls: readonly PendingCall[];
	readonly recentEvents: readonly string[];
};

export type NodeDiagnosticsSnapshot = RpcDiagnosticsSnapshot & {
	readonly owner: LabObservedState;
	readonly listener?: LabObservedState;
	readonly peers: readonly {
		readonly id?: string;
		readonly state: LabObservedState;
	}[];
	readonly configuration: readonly LabOwnerConfiguration[];
	readonly ownerStatus: RpcStateStatusEnum;
	readonly listenerStatus: RpcStateStatusEnum;
	readonly peerStatuses: readonly RpcStateStatusEnum[];
};
