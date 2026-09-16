/**
 * @overview Calls the project service without coupling the workbench to tested runtimes.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

export type PlatformProjectSummary = {
	id: string;
	rootPath: string;
	builtin?: boolean;
};

export type PlatformProjectView = PlatformProjectSummary & {
	files: { path: string; revision: string; size: number; isCase: boolean }[];
	historyLimits: { count: number; bytes: number };
};

export type PlatformFile = { path: string; content: string; revision: string };

export type PlatformSaveResult = {
	saved: boolean;
	file: PlatformFile | null;
	conflict?: {
		draft: string;
		disk: PlatformFile | null;
		preserved?: PlatformFile;
	};
};

export type PlatformDiagnostic = {
	path: string;
	start: number;
	length: number;
	code: number;
	message: string;
	category: string;
};

export type PlatformSourceLocation = {
	path: string;
	start?: number;
	length?: number;
	line?: number;
	column?: number;
};

export async function platformRequest<T>(
	path: string,
	method = "GET",
	body?: unknown,
): Promise<T> {
	const response = await fetch(`/api/platform${path}`, {
		method,
		cache: "no-store",
		headers:
			body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: AbortSignal.timeout(15_000),
	});
	const value = response.status === 204 ? undefined : await response.json();
	if (!response.ok) {
		throw new Error(
			value?.error?.message ??
				value?.error ??
				`Project service: ${response.status}`,
		);
	}
	return value as T;
}

export function projectPath(projectId: string): string {
	return `/projects/${encodeURIComponent(projectId)}`;
}

export function filePath(projectId: string, path: string): string {
	return `${projectPath(projectId)}/files?path=${encodeURIComponent(path)}`;
}

export function runPath(projectId: string, runId: string): string {
	return `${projectPath(projectId)}/runs/${encodeURIComponent(runId)}`;
}
