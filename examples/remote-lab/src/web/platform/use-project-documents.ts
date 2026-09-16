/**
 * @overview Keeps local drafts and serial optimistic saves intact across file switches and IDE conflicts.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	filePath,
	type PlatformFile,
	type PlatformProjectView,
	type PlatformSaveResult,
	platformRequest,
	projectPath,
} from "./platform-api";

export type ProjectDocument = PlatformFile & {
	savedContent: string;
	status: DocumentSaveStatusEnum;
	error?: string;
	conflict?: PlatformFile;
	preservedConflict?: PlatformFile;
};

export enum DocumentSaveStatusEnum {
	saved = "saved",
	dirty = "dirty",
	saving = "saving",
	failed = "failed",
	conflict = "conflict",
}

export function useProjectDocuments(projectId: string | undefined) {
	const [documents, setDocuments] = useState<ProjectDocument[]>([]);
	const [project, setProject] = useState<PlatformProjectView>();
	const [error, setError] = useState<string>();
	const state = useRef(new Map<string, ProjectDocument>());
	const tasks = useRef(new Map<string, Promise<void>>());
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	const generation = useRef(0);
	const publish = useCallback(
		() => setDocuments([...state.current.values()]),
		[],
	);

	const save = useCallback(
		async (path: string) => {
			if (!projectId) return;
			const timer = timers.current.get(path);
			if (timer) clearTimeout(timer);
			timers.current.delete(path);
			const pending = tasks.current.get(path);
			if (pending) return pending;
			const currentGeneration = generation.current;
			const task = (async () => {
				let document = state.current.get(path);
				while (document && document.content !== document.savedContent) {
					if (document.status === DocumentSaveStatusEnum.conflict) {
						throw new Error(
							`Resolve the IDE conflict in ${path} before running.`,
						);
					}
					const content = document.content;
					document.status = DocumentSaveStatusEnum.saving;
					document.error = undefined;
					publish();
					try {
						const result = await platformRequest<PlatformSaveResult>(
							filePath(projectId, path),
							"PUT",
							{
								content,
								expectedRevision: document.revision || null,
							},
						);
						if (currentGeneration !== generation.current) return;
						if (!result.saved) {
							document.conflict = result.conflict?.disk ??
								result.file ?? { path, content: "", revision: "" };
							document.preservedConflict = result.conflict?.preserved;
							document.status = DocumentSaveStatusEnum.conflict;
							throw new Error(
								`IDE changed ${path}; both versions are preserved.`,
							);
						}
						document.savedContent = content;
						if (!result.file)
							throw new Error("Save confirmation is missing the saved file.");
						document.revision = result.file.revision;
						document.status =
							document.content === content
								? DocumentSaveStatusEnum.saved
								: DocumentSaveStatusEnum.dirty;
					} catch (failure) {
						if (currentGeneration !== generation.current) return;
						document.error =
							failure instanceof Error ? failure.message : String(failure);
						if (!document.conflict)
							document.status = DocumentSaveStatusEnum.failed;
						throw failure;
					} finally {
						if (currentGeneration === generation.current) publish();
					}
					document = state.current.get(path);
				}
			})();
			tasks.current.set(path, task);
			try {
				await task;
			} finally {
				if (tasks.current.get(path) === task) tasks.current.delete(path);
			}
		},
		[projectId, publish],
	);

	const refresh = useCallback(async () => {
		if (!projectId) return;
		const currentGeneration = generation.current;
		const description = await platformRequest<PlatformProjectView>(
			projectPath(projectId),
		);
		const updates = await Promise.all(
			description.files.map(async (file) => {
				const current = state.current.get(file.path);
				if (
					current?.revision === file.revision ||
					current?.status === DocumentSaveStatusEnum.saving
				)
					return;
				return platformRequest<PlatformFile>(filePath(projectId, file.path));
			}),
		);
		if (currentGeneration !== generation.current) return;
		setProject(description);
		for (const update of updates) {
			if (!update) continue;
			const current = state.current.get(update.path);
			if (
				current &&
				current.revision !== update.revision &&
				current.content !== current.savedContent
			) {
				// A disk refresh never overwrites a draft, including one edited while HTTP was in flight.
				current.conflict = update;
				current.status = DocumentSaveStatusEnum.conflict;
				continue;
			}
			if (current?.status === DocumentSaveStatusEnum.saving) continue;
			state.current.set(update.path, {
				...update,
				savedContent: update.content,
				status: DocumentSaveStatusEnum.saved,
			});
		}
		const diskPaths = new Set(description.files.map((file) => file.path));
		for (const [path, document] of state.current) {
			if (diskPaths.has(path)) continue;
			if (document.content === document.savedContent)
				state.current.delete(path);
			else {
				document.status = DocumentSaveStatusEnum.failed;
				document.error =
					"File was removed by another editor; draft retained. Restore the file before saving.";
			}
		}
		setError(undefined);
		publish();
	}, [projectId, publish]);

	useEffect(() => {
		generation.current += 1;
		state.current.clear();
		tasks.current.clear();
		for (const timer of timers.current.values()) clearTimeout(timer);
		timers.current.clear();
		setProject(undefined);
		publish();
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				await refresh();
			} catch (failure) {
				if (!cancelled)
					setError(
						failure instanceof Error ? failure.message : String(failure),
					);
			}
			if (!cancelled) timer = setTimeout(() => void poll(), 1_500);
		};
		void poll();
		return () => {
			cancelled = true;
			generation.current += 1;
			clearTimeout(timer);
			for (const pending of timers.current.values()) clearTimeout(pending);
		};
	}, [refresh, publish]);

	const edit = useCallback(
		(path: string, content: string) => {
			const document = state.current.get(path);
			if (!document || document.content === content) return;
			document.content = content;
			if (!document.conflict)
				document.status =
					content === document.savedContent
						? DocumentSaveStatusEnum.saved
						: DocumentSaveStatusEnum.dirty;
			publish();
			const timer = timers.current.get(path);
			if (timer) clearTimeout(timer);
			if (!document.conflict)
				timers.current.set(
					path,
					setTimeout(() => void save(path).catch(() => {}), 450),
				);
		},
		[publish, save],
	);

	const flush = useCallback(async () => {
		for (const document of state.current.values()) {
			if (document.conflict)
				throw new Error(
					`Resolve the IDE conflict in ${document.path} before running.`,
				);
		}
		await Promise.all([...state.current.keys()].map(save));
		await refresh();
		if (
			[...state.current.values()].some(
				(document) =>
					document.content !== document.savedContent || document.conflict,
			)
		) {
			throw new Error(
				"Project changed while saving. Resolve or save every draft before running.",
			);
		}
		return Object.fromEntries(
			[...state.current.values()].map((document) => [
				document.path,
				document.revision,
			]),
		);
	}, [save, refresh]);

	const resolveConflict = useCallback(
		async (path: string, useDisk: boolean) => {
			const document = state.current.get(path);
			if (!document?.conflict) return;
			const disk = document.conflict;
			if (useDisk) document.content = disk.content;
			document.revision = disk.revision;
			document.savedContent = disk.content;
			document.conflict = undefined;
			document.preservedConflict = undefined;
			document.error = undefined;
			document.status =
				document.content === disk.content
					? DocumentSaveStatusEnum.saved
					: DocumentSaveStatusEnum.dirty;
			publish();
			await save(path);
		},
		[publish, save],
	);

	return {
		documents,
		project,
		error,
		refresh,
		edit,
		save,
		flush,
		resolveConflict,
	};
}
