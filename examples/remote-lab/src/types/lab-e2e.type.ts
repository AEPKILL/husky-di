/**
 * @overview Describes Lab-owned E2E reports separately from RPC diagnostics.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import type {
	LabE2ePackageEnum,
	LabE2eStatusEnum,
	LabE2eSuiteEnum,
	LabE2eTestStatusEnum,
} from "@/enums/lab-e2e.enum";
import type { LabSideEnum } from "@/enums/lab-recording.enum";
import type { LabRecordingSnapshot } from "@/types/lab-recording.type";

export type LabE2eRecording = {
	readonly runId: string;
	readonly caseId: string;
	readonly package: LabE2ePackageEnum;
	readonly source: string;
	readonly side: LabSideEnum;
	readonly snapshot: LabRecordingSnapshot;
};

export type LabE2eRecordingInput = Pick<LabE2eRecording, "side" | "snapshot">;

export type LabE2eTest = {
	id: string;
	title: string;
	package: LabE2ePackageEnum;
	source: string;
	status: LabE2eTestStatusEnum;
	durationMs: number;
	step?: string;
	errors: string[];
	recordings: LabE2eRecording[];
};

export type LabE2eCaseContext = {
	readonly signal: AbortSignal;
	trace(label: string): string;
	step(value: string): void;
	capture(...recordings: readonly LabE2eRecordingInput[]): void;
	cleanup(operation: () => void | Promise<void>): Promise<void>;
	own(operation: () => void | Promise<void>): () => void;
	failInfrastructure(error: unknown): never;
};

export type LabE2eCase = {
	readonly id: string;
	readonly title: string;
	readonly package: LabE2ePackageEnum;
	readonly source: string;
	run(context: LabE2eCaseContext): Promise<void>;
};

export type LabE2eRun = {
	id: string;
	suite: LabE2eSuiteEnum;
	status: LabE2eStatusEnum;
	startedAt: number;
	finishedAt?: number;
	tests: LabE2eTest[];
	logs: string[];
	errors: string[];
	cleanupComplete: boolean;
};

export type LabE2eSnapshot = {
	ownerId: string;
	suite: LabE2eSuiteEnum;
	active?: LabE2eRun;
	last?: LabE2eRun;
};
