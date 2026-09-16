/**
 * @overview Project-owned file, snapshot, language and durable-history capabilities consumed by Lab control surfaces.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type {
	PlatformHistoryRecord,
	PlatformHistorySummary,
	PlatformLanguageCompletion,
	PlatformLanguageDefinition,
	PlatformLanguageDiagnostic,
	PlatformProjectDescription,
	PlatformSaveResult,
	PlatformSnapshotRequest,
	PlatformSourceFile,
	PlatformSourceSnapshot,
} from "@/types/platform-project.type";

export interface IPlatformProject {
	readonly rootPath: string;
	describe(): Promise<PlatformProjectDescription>;
	readFile(path: string): Promise<PlatformSourceFile>;
	saveFile(
		path: string,
		content: string,
		expectedRevision: string | null,
	): Promise<PlatformSaveResult>;
	snapshot(request: PlatformSnapshotRequest): Promise<PlatformSourceSnapshot>;
	materializeSnapshot(
		snapshot: PlatformSourceSnapshot,
		destination: string,
	): Promise<void>;
	saveHistory(record: PlatformHistoryRecord): Promise<PlatformHistoryRecord>;
	listHistory(): Promise<PlatformHistorySummary[]>;
	readHistory(id: string): Promise<PlatformHistoryRecord>;
	deleteHistory(id: string): Promise<void>;
	diagnostics(
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageDiagnostic[]>;
	completions(
		path: string,
		position: number,
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageCompletion[]>;
	definitions(
		path: string,
		position: number,
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageDefinition[]>;
	readDefinition(path: string): Promise<PlatformSourceFile>;
	dispose(): void;
}

export interface IPlatformHistory {
	saveHistory(record: PlatformHistoryRecord): Promise<PlatformHistoryRecord>;
	listHistory(): Promise<PlatformHistorySummary[]>;
	readHistory(id: string): Promise<PlatformHistoryRecord>;
	deleteHistory(id: string): Promise<void>;
}

export interface IPlatformLanguage {
	diagnostics(
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageDiagnostic[]>;
	completions(
		path: string,
		position: number,
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageCompletion[]>;
	definitions(
		path: string,
		position: number,
		overlays?: Record<string, string>,
	): Promise<PlatformLanguageDefinition[]>;
	readDefinition(path: string): Promise<PlatformSourceFile>;
	dispose(): void;
}
