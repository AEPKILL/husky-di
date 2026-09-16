/**
 * @overview Opens local Lab projects with optimistic file saves, fixed full-project snapshots and project-owned services.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createHash, randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	readdir,
	readFile,
	realpath,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatformHistory } from "@/factories/platform-history.factory";
import { createPlatformLanguage } from "@/factories/platform-language.factory";
import type { IPlatformProject } from "@/interfaces/platform-project.interface";
import type {
	PlatformProjectFile,
	PlatformSourceFile,
} from "@/types/platform-project.type";
import { validatePlatformSnapshotImports } from "@/utils/validate-platform-snapshot-imports.util";
import { writePlatformSource } from "@/utils/write-platform-source.util";

export type CreatePlatformProjectOptions = {
	rootPath: string;
	historyPath?: string;
	maxHistoryCount?: number;
	maxHistoryBytes?: number;
	maxSnapshotBytes?: number;
};

export async function createPlatformProject(
	options: CreatePlatformProjectOptions,
): Promise<IPlatformProject> {
	const rootPath = await realpath(resolve(options.rootPath));
	if (!(await stat(rootPath)).isDirectory())
		throw new Error("Project path must be an existing local directory");
	const maxHistoryCount = options.maxHistoryCount ?? 30;
	const maxHistoryBytes = options.maxHistoryBytes ?? 64 * 1024 * 1024;
	const maxSnapshotBytes = options.maxSnapshotBytes ?? 16 * 1024 * 1024;
	for (const limit of [maxHistoryCount, maxHistoryBytes, maxSnapshotBytes]) {
		if (!Number.isSafeInteger(limit) || limit < 1)
			throw new Error("Project limits must be positive integers");
	}
	const historyPath = resolve(
		options.historyPath ?? join(rootPath, ".remote-lab/history"),
	);
	const history = await createPlatformHistory({
		path: historyPath,
		maxCount: maxHistoryCount,
		maxBytes: maxHistoryBytes,
	});
	const excluded = new Set(["node_modules", ".git", ".remote-lab"]);
	let saveQueue: Promise<unknown> = Promise.resolve();
	const resolveFile = async (path: string) => {
		const absolute = resolve(rootPath, path);
		const local = relative(rootPath, absolute);
		if (
			!local ||
			local === ".." ||
			local.startsWith(`..${sep}`) ||
			isAbsolute(local) ||
			local.split(sep).some((part) => excluded.has(part))
		)
			throw new Error(
				"File path must be inside the editable project source tree",
			);
		let ancestor = rootPath;
		for (const part of local.split(sep)) {
			ancestor = join(ancestor, part);
			const entry = await lstat(ancestor).catch(
				(error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT") return undefined;
					throw error;
				},
			);
			if (entry?.isSymbolicLink())
				throw new Error(
					"Project source symlinks are not editable; open their actual project directory",
				);
		}
		return absolute;
	};
	const readSource = async (path: string): Promise<PlatformSourceFile> => {
		const bytes = await readFile(await resolveFile(path));
		const content = bytes.toString("utf8");
		if (!Buffer.from(content).equals(bytes) || content.includes("\0"))
			throw new Error(
				"Binary assets are preserved in snapshots but cannot be edited as source text",
			);
		return { path, content, revision: hash(bytes) };
	};
	const readOptional = async (path: string) =>
		readSource(path).catch((error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return null;
			throw error;
		});
	const listFiles = async (): Promise<PlatformProjectFile[]> => {
		const files: PlatformProjectFile[] = [];
		const walk = async (directory: string): Promise<void> => {
			for (const entry of await readdir(directory, { withFileTypes: true })) {
				const absolute = join(directory, entry.name);
				if (
					excluded.has(entry.name) ||
					absolute === historyPath ||
					entry.name.startsWith(".remote-lab-save-")
				)
					continue;
				if (entry.isSymbolicLink())
					throw new Error(
						`Project source symlink cannot be snapshotted: ${relative(rootPath, absolute)}`,
					);
				if (entry.isDirectory()) await walk(absolute);
				else if (entry.isFile()) {
					const content = await readFile(absolute);
					const path = relative(rootPath, absolute).split(sep).join("/");
					files.push({
						path,
						size: content.byteLength,
						revision: hash(content),
						isCase: path.endsWith(".case.ts"),
					});
				}
			}
		};
		await walk(rootPath);
		return files.sort((left, right) => left.path.localeCompare(right.path));
	};
	const language = createPlatformLanguage({ rootPath, resolveFile, listFiles });
	return {
		rootPath,
		...history,
		...language,
		async describe() {
			return {
				rootPath,
				files: await listFiles(),
				historyLimits: { count: maxHistoryCount, bytes: maxHistoryBytes },
				maxSnapshotBytes,
			};
		},
		readFile: readSource,
		saveFile(path, content, expectedRevision) {
			const save = saveQueue.then(async () => {
				if (
					typeof content !== "string" ||
					(expectedRevision !== null && typeof expectedRevision !== "string")
				)
					throw new Error(
						"Save requires text and the previously observed file revision",
					);
				const destination = await resolveFile(path);
				const current = await readOptional(path);
				if ((current?.revision ?? null) !== expectedRevision)
					return {
						saved: false,
						file: current,
						conflict: { draft: content, disk: current },
					};
				await mkdir(dirname(destination), { recursive: true });
				if (expectedRevision === null) {
					try {
						await writeFile(destination, content, { flag: "wx", flush: true });
					} catch (error) {
						if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
						const disk = await readOptional(path);
						return {
							saved: false,
							file: disk,
							conflict: { draft: content, disk },
						};
					}
				} else
					return writePlatformSource(rootPath, path, content, expectedRevision);
				return {
					saved: true,
					file: { path, content, revision: hash(content) },
				};
			});
			saveQueue = save.catch(() => undefined);
			return save;
		},
		async snapshot(request) {
			await saveQueue;
			const entry = relative(rootPath, await resolveFile(request.entry))
				.split(sep)
				.join("/");
			if (!entry.endsWith(".case.ts"))
				throw new Error(
					"Case entry must be a project *.case.ts module exporting labCase",
				);
			const before = await listFiles();
			if (!before.some((file) => file.path === entry))
				throw new Error(`The saved case entry does not exist: ${entry}`);
			if (
				before.reduce((bytes, file) => bytes + file.size, 0) > maxSnapshotBytes
			)
				throw new Error(
					"Project source exceeds the snapshot byte limit; no partial snapshot was created",
				);
			const files: Record<string, string> = {};
			const binaryFiles: Record<string, string> = {};
			const revisions: Record<string, string> = {};
			for (const file of before) {
				const bytes = await readFile(await resolveFile(file.path));
				if (hash(bytes) !== file.revision)
					throw new Error(
						"Project source changed while taking the snapshot; save or resolve edits and start again",
					);
				const content = bytes.toString("utf8");
				if (
					Buffer.from(content, "utf8").equals(bytes) &&
					!content.includes("\0")
				)
					files[file.path] = content;
				else binaryFiles[file.path] = bytes.toString("base64");
				revisions[file.path] = file.revision;
			}
			validatePlatformSnapshotImports(rootPath, files);
			const after = await listFiles();
			if (JSON.stringify(before) !== JSON.stringify(after))
				throw new Error(
					"Project source changed while taking the snapshot; save or resolve edits and start again",
				);
			return {
				id: randomUUID(),
				createdAt: Date.now(),
				rootPath,
				entry,
				files,
				binaryFiles,
				revisions,
				parameters: structuredClone(request.parameters ?? {}),
				environment: {
					node: process.version,
					platform: process.platform,
					architecture: process.arch,
					...structuredClone(request.environment ?? {}),
				},
				dependencies: await readDependencyVersions(
					rootPath,
					files["package.json"],
				),
			};
		},
		async materializeSnapshot(snapshot, destination) {
			const target = resolve(destination);
			await mkdir(target, { recursive: true });
			for (const [path, content] of [
				...Object.entries(snapshot.files),
				...Object.entries(snapshot.binaryFiles),
			]) {
				const absolute = resolve(target, path);
				const local = relative(target, absolute);
				if (
					!local ||
					local === ".." ||
					local.startsWith(`..${sep}`) ||
					isAbsolute(local) ||
					local.split(sep).some((part) => excluded.has(part))
				)
					throw new Error("Snapshot contains a path outside its source tree");
				await mkdir(dirname(absolute), { recursive: true });
				await writeFile(
					absolute,
					snapshot.binaryFiles[path] === undefined
						? content
						: Buffer.from(content, "base64"),
					{ flag: "wx" },
				);
			}
		},
	};
}

function hash(content: string | Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

async function readDependencyVersions(
	rootPath: string,
	manifest?: string,
): Promise<Record<string, string>> {
	const packageJson = manifest ? JSON.parse(manifest) : {};
	const declared = {
		...packageJson.dependencies,
		...packageJson.devDependencies,
		...packageJson.peerDependencies,
		...packageJson.optionalDependencies,
	} as Record<string, string>;
	const platformRoot = resolve(
		dirname(fileURLToPath(import.meta.url)),
		"../..",
	);
	// The runtime can provide Lab's installed dependencies to a new project without a node_modules directory.
	for (const name of [
		"@husky-di/core",
		"@husky-di/remote",
		"@husky-di/remote-websocket",
		"rxjs",
		"esbuild",
		"typescript",
		"tsx",
		"@playwright/test",
	])
		declared[name] ??= "provided by Lab";
	const versions: Record<string, string> = {};
	for (const [name, requested] of Object.entries(declared)) {
		if (!/^(?:@[a-zA-Z0-9._-]+\/)?[a-zA-Z0-9._-]+$/.test(name)) continue;
		let version: string | undefined;
		for (const origin of [rootPath, platformRoot]) {
			let directory = origin;
			while (true) {
				try {
					version = (
						JSON.parse(
							await readFile(
								join(directory, "node_modules", name, "package.json"),
								"utf8",
							),
						) as { version?: string }
					).version;
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
				}
				if (version || dirname(directory) === directory) break;
				directory = dirname(directory);
			}
			if (version) break;
		}
		versions[name] = version ?? `unresolved (requested ${requested})`;
	}
	return versions;
}
