/**
 * @overview Application snapshots and results deliberately separate from payload-free RPC diagnostics.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcCallStatusEnum, RpcStateStatusEnum } from "@husky-di/remote";
import type { LabRecordingSnapshot } from "@/types/lab-recording.type";

export type ShippingQuote = {
	readonly from: string;
	readonly to: string;
	readonly kg: number;
	readonly amount: number;
	readonly currency: string;
};

export type LabReport = {
	readonly traceId: string;
	readonly rows: number;
	readonly handlerEntries: number;
	readonly aborted: boolean;
};

export type LabFanoutResult = {
	readonly peerId: string;
	readonly outcome: RpcCallStatusEnum.fulfilled | RpcCallStatusEnum.rejected;
	readonly result: string;
};

export type LabServerSnapshot = {
	readonly peers: readonly {
		readonly id: string;
		readonly status: RpcStateStatusEnum;
		readonly peerExposure: boolean;
		readonly handlerEntries: number;
	}[];
	readonly globalExposure: boolean;
	readonly pausedReports: readonly {
		readonly traceId: string;
		readonly peerId: string;
		readonly aborted: boolean;
	}[];
	readonly recording: LabRecordingSnapshot;
};
