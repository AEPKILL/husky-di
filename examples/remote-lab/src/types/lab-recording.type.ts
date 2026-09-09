/**
 * @overview Detached bounded application records, separate from public RPC observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcCallDirectionEnum } from "@husky-di/remote";
import type { LabSideEnum, LabSourceEnum } from "@/enums/lab-recording.enum";

export type LabCallContext = {
	readonly traceId: string;
	readonly peerId: string;
	readonly side: LabSideEnum;
	readonly direction: RpcCallDirectionEnum;
	readonly service: string;
	readonly method: string;
};

export type LabCallPhase = {
	readonly phase: string;
	readonly at: number;
	readonly detail?: string;
};

export type LabCallRecord = LabCallContext & {
	readonly id: string;
	readonly startedAt: number;
	readonly finishedAt?: number;
	readonly outcome: string;
	readonly arguments: string;
	readonly result?: string;
	readonly phases: readonly LabCallPhase[];
};

export type LabLogEntry = {
	readonly id: string;
	readonly at: number;
	readonly source: LabSourceEnum;
	readonly summary: string;
};

export type LabRecordingSnapshot = {
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly LabLogEntry[];
};
