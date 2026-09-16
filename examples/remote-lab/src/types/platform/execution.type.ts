/**
 * @overview Defines the serializable process boundary used by UI and CLI supervisors.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type {
	LabCaseOutcomeEnum,
	LabExecutionCommandEnum,
	LabExecutionEventEnum,
	LabExecutionModeEnum,
	LabExecutionStateEnum,
} from "@/enums/platform/execution.enum";

export type LabExecutionStart = {
	readonly type: LabExecutionCommandEnum.start;
	readonly snapshotDir: string;
	readonly entries: readonly string[];
	readonly parameters: Readonly<Record<string, unknown>>;
	readonly mode: LabExecutionModeEnum;
	readonly browserWSEndpoint?: string;
	readonly timeoutMs?: number;
};

export type LabExecutionCommand =
	| LabExecutionStart
	| {
			readonly type: Exclude<
				LabExecutionCommandEnum,
				LabExecutionCommandEnum.start
			>;
	  };

export type LabSourceLocation = {
	readonly file: string;
	readonly line: number;
	readonly column: number;
};

export type LabExecutionEvent = {
	readonly type: LabExecutionEventEnum;
	readonly timestamp: number;
	readonly entry?: string;
	readonly stepId?: string;
	readonly name?: string;
	readonly source?: LabSourceLocation;
	readonly state?: LabExecutionStateEnum;
	readonly phase?: string;
	readonly outcome?: LabCaseOutcomeEnum;
	readonly passed?: boolean;
	readonly message?: string;
	readonly actual?: unknown;
	readonly expected?: unknown;
	readonly data?: unknown;
	readonly error?: string;
	readonly infrastructure?: boolean;
	readonly assertions?: number;
	readonly durationMs?: number;
	readonly timeoutMs?: number;
	readonly complete?: boolean;
	readonly truncated?: boolean;
};
