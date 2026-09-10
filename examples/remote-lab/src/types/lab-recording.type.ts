/**
 * @overview Detached bounded application records, separate from public RPC observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import type { RpcCallDirectionEnum, RpcEventTypeEnum } from "@husky-di/remote";
import type {
	LabHandshakeKindEnum,
	LabSideEnum,
	LabSourceEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";

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

export type LabHandshakeObservation = {
	readonly type:
		| RpcEventTypeEnum.peerOpened
		| RpcEventTypeEnum.peerRecovering
		| RpcEventTypeEnum.peerRecovered
		| RpcEventTypeEnum.peerClosed;
	readonly peerId: string;
	readonly outcome: string;
	readonly reason?: string;
};

export type LabHandshakeFrame = {
	readonly type: LabHandshakeKindEnum;
	readonly connectionId: string;
	readonly sessionId?: string;
	readonly direction: LabTransportDirectionEnum;
	readonly bytes: number;
	readonly outcome: string;
	readonly payload: string;
};

export type LabLogEntry = {
	readonly id: string;
	readonly at: number;
	readonly source: LabSourceEnum;
	readonly summary: string;
	readonly handshake?: LabHandshakeObservation;
	readonly handshakeFrame?: LabHandshakeFrame;
};

export type LabRecordingSnapshot = {
	readonly sessionId?: string;
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly LabLogEntry[];
};
