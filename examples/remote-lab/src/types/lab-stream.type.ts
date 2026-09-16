/**
 * @overview Snapshot contracts for the explicit Observable stream experiment.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

import type {
	LabStreamKindEnum,
	LabStreamSourceStatusEnum,
	LabStreamStatusEnum,
} from "@/enums/lab-stream.enum";
import type { LabLogEntry } from "@/types/lab-recording.type";

export type LabStreamRecord = {
	readonly id: number;
	readonly kind: LabStreamKindEnum;
	readonly status: LabStreamStatusEnum;
	readonly values: readonly string[];
	readonly terminal: string;
	readonly retained: number;
};

export type LabStreamExperimentSnapshot = {
	readonly connected: boolean;
	readonly retained: number;
	readonly maxRetained: number;
	readonly staticSource: LabStreamSourceStatusEnum;
	readonly staticSubscribers: number;
	readonly nextStreamId: number;
	readonly streams: readonly LabStreamRecord[];
	readonly logs: readonly string[];
	readonly networkEntries: readonly LabLogEntry[];
};
