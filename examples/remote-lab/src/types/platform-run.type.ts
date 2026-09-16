/**
 * @overview Serializable project-owned reports shared by the workbench, CLI, and history.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { LabExecutionModeEnum } from "@/enums/platform/execution.enum";
import type {
	PlatformCleanupEnum,
	PlatformRunResultEnum,
	PlatformRunStateEnum,
	PlatformTerminationEnum,
} from "@/enums/platform-run.enum";
import type { LabExecutionEvent } from "@/types/platform/execution.type";
import type { PlatformSourceSnapshot } from "@/types/platform-project.type";

export type PlatformRun = {
	id: string;
	projectId: string;
	entries: string[];
	mode: LabExecutionModeEnum;
	state: PlatformRunStateEnum;
	result: PlatformRunResultEnum;
	termination: PlatformTerminationEnum;
	cleanup: PlatformCleanupEnum;
	snapshot: PlatformSourceSnapshot;
	events: LabExecutionEvent[];
	createdAt: number;
	completedAt?: number;
	recordingTruncated: boolean;
	error?: string;
	active: boolean;
};

export type PlatformRunRequest = {
	entry?: string;
	entries?: string[];
	mode?: LabExecutionModeEnum;
	parameters?: Record<string, unknown>;
	expectedRevisions?: Record<string, string>;
};

export type PlatformRunSummary = Omit<PlatformRun, "snapshot" | "events">;
