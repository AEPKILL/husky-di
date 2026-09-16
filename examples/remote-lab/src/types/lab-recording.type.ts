/**
 * @overview Detached bounded application records, separate from public RPC observations.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
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

export type LabTransportMessage = {
	readonly type: string;
	readonly connectionId: string;
	readonly sessionId?: string;
	readonly direction: LabTransportDirectionEnum;
	readonly bytes: number;
	readonly outcome: string;
	readonly payload?: string;
};

export type LabHandshakeFrame = LabTransportMessage & {
	readonly type: LabHandshakeKindEnum;
	readonly payload: string;
};

export type LabLogEntry = {
	readonly id: string;
	readonly at: number;
	readonly source: LabSourceEnum;
	readonly summary: string;
	readonly managedE2e?: boolean;
	readonly handshake?: LabHandshakeObservation;
	readonly handshakeFrame?: LabHandshakeFrame;
	readonly transportMessage?: LabTransportMessage;
};

export type LabRecordingSnapshot = {
	readonly connections: readonly LabConnectionObservation[];
	readonly sessionId?: string;
	readonly calls: readonly LabCallRecord[];
	readonly entries: readonly LabLogEntry[];
};

export type LabConnectionObservation = {
	readonly connectionId: string;
	readonly sessionId?: string;
	readonly observedAt: number;
};
