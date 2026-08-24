/**
 * @overview Serializable Node snapshots and browser-observed RPC diagnostics.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

export type NodeDiagnosticsSnapshot = {
	readonly ownerStatus: string;
	readonly listenerStatus: string;
	readonly peerCount: number;
	readonly peerStatuses: readonly string[];
	readonly pendingCalls: number;
	readonly totalEvents: number;
};

export type PendingCallDiagnostic = {
	readonly observationId: string;
	readonly direction: string;
	readonly service: string;
	readonly member: string;
	readonly startedAt: number;
};

export type RpcEventDiagnostic = {
	readonly id: string;
	readonly type: string;
	readonly timestamp: number;
	readonly direction?: string;
	readonly service?: string;
	readonly member?: string;
	readonly outcome?: string;
	readonly code?: string;
};
