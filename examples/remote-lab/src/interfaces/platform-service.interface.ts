/**
 * @overview Control-plane interface for project files and independently owned executions.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { LabExecutionCommandEnum } from "@/enums/platform/execution.enum";
import type {
	PlatformRun,
	PlatformRunRequest,
} from "@/types/platform-run.type";

export interface IPlatformService {
	readonly limits: {
		debugRetentionMs: number;
		heartbeatLeaseMs: number;
		stopGraceMs: number;
		maxEvents: number;
		maxEventBytes: number;
	};
	openProject(
		rootPath: string,
	): Promise<{ id: string; rootPath: string; builtin: boolean }>;
	start(projectId: string, request: PlatformRunRequest): Promise<PlatformRun>;
	control(
		projectId: string,
		runId: string,
		action: Exclude<LabExecutionCommandEnum, LabExecutionCommandEnum.start>,
	): Promise<PlatformRun>;
	readRun(projectId: string, runId: string): Promise<PlatformRun>;
	handleRequest(request: IncomingMessage, response: ServerResponse): boolean;
	shutdown(): Promise<void>;
}
