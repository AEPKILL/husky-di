/**
 * @overview Saved project files, immutable execution snapshots, language results and bounded history records.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

export type PlatformProjectFile = {
	path: string;
	revision: string;
	size: number;
	isCase: boolean;
};

export type PlatformSourceFile = {
	path: string;
	content: string;
	revision: string;
};

export type PlatformSaveResult = {
	saved: boolean;
	file: PlatformSourceFile | null;
	conflict?: {
		draft: string;
		disk: PlatformSourceFile | null;
		preserved?: PlatformSourceFile;
	};
};

export type PlatformProjectDescription = {
	rootPath: string;
	files: PlatformProjectFile[];
	historyLimits: { count: number; bytes: number };
	maxSnapshotBytes: number;
};

export type PlatformSnapshotRequest = {
	entry: string;
	parameters?: Record<string, unknown>;
	environment?: Record<string, unknown>;
};

export type PlatformSourceSnapshot = {
	id: string;
	createdAt: number;
	rootPath: string;
	entry: string;
	files: Record<string, string>;
	binaryFiles: Record<string, string>;
	revisions: Record<string, string>;
	parameters: Record<string, unknown>;
	environment: Record<string, unknown>;
	dependencies: Record<string, string>;
};

export type PlatformHistoryRecord = {
	id: string;
	snapshot: PlatformSourceSnapshot;
	data: Record<string, unknown>;
	active: boolean;
	interrupted?: boolean;
	recordingTruncated?: boolean;
	recordingNotice?: string;
	savedAt?: number;
};

export type PlatformHistorySummary = {
	id: string;
	data: Record<string, unknown>;
	entry: string;
	createdAt: number;
	savedAt: number;
	active: boolean;
	interrupted: boolean;
	recordingTruncated: boolean;
	bytes: number;
};

export type PlatformLanguageDiagnostic = {
	path: string;
	start: number;
	length: number;
	code: number;
	message: string;
	category: string;
};

export type PlatformLanguageCompletion = {
	name: string;
	kind: string;
	sortText: string;
	insertText?: string;
	replacementSpan?: { start: number; length: number };
};

export type PlatformLanguageDefinition = {
	path: string;
	start: number;
	length: number;
	name: string;
};
