/**
 * @overview Serves project-wide TypeScript diagnostics, completions and source definitions over saved files and editor overlays.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { IPlatformLanguage } from "@/interfaces/platform-project.interface";
import type { PlatformProjectFile } from "@/types/platform-project.type";

export type CreatePlatformLanguageOptions = {
	rootPath: string;
	listFiles(): Promise<PlatformProjectFile[]>;
	resolveFile(path: string): Promise<string>;
};

export function createPlatformLanguage(
	options: CreatePlatformLanguageOptions,
): IPlatformLanguage {
	const platformSource = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const platformRoot = resolve(platformSource, "..");
	const defaultTypeRoots: string[] = [];
	for (let directory = options.rootPath; ; directory = dirname(directory)) {
		defaultTypeRoots.push(resolve(directory, "node_modules/@types"));
		if (dirname(directory) === directory) break;
	}
	defaultTypeRoots.push(resolve(platformRoot, "node_modules/@types"));
	const sources = new Map<string, string>();
	const navigation = new Set<string>();
	let files: string[] = [];
	let compilerOptions: ts.CompilerOptions = {};
	let configuration = "";
	let service: ts.LanguageService;
	let queue: Promise<unknown> = Promise.resolve();
	const serial = <T>(operation: () => Promise<T>) => {
		const next = queue.then(operation);
		queue = next.catch(() => undefined);
		return next;
	};
	const read = (path: string) => sources.get(path) ?? ts.sys.readFile(path);
	const host: ts.LanguageServiceHost = {
		getScriptFileNames: () => files,
		getScriptVersion: (path) =>
			createHash("sha256")
				.update(read(path) ?? "")
				.digest("hex"),
		getScriptSnapshot: (path) => {
			const source = read(path);
			return source === undefined
				? undefined
				: ts.ScriptSnapshot.fromString(source);
		},
		getCompilationSettings: () => compilerOptions,
		getCurrentDirectory: () => options.rootPath,
		getDefaultLibFileName: (settings) => ts.getDefaultLibFilePath(settings),
		fileExists: (path) => sources.has(path) || ts.sys.fileExists(path),
		readFile: read,
		readDirectory: ts.sys.readDirectory,
		getDirectories: ts.sys.getDirectories,
		directoryExists: ts.sys.directoryExists,
		realpath: ts.sys.realpath,
		resolveModuleNames: (names, containingFile) =>
			names.map((name) => {
				let moduleOptions = compilerOptions;
				if (containingFile.startsWith(`${platformSource}${sep}`)) {
					moduleOptions = {
						...compilerOptions,
						paths: { ...compilerOptions.paths, "@/*": [`${platformSource}/*`] },
					};
				}
				const resolved = ts.resolveModuleName(
					name,
					containingFile,
					moduleOptions,
					host,
				).resolvedModule;
				if (resolved) return resolved;
				// The Lab runtime supplies these installed declarations when the developer project has no dependency tree yet.
				return ts.resolveModuleName(
					name,
					resolve(platformRoot, "package.json"),
					moduleOptions,
					host,
				).resolvedModule;
			}),
	};
	const refresh = async (overlays: Record<string, string> = {}) => {
		const projectFiles = await options.listFiles();
		sources.clear();
		for (const file of projectFiles) {
			if (!/\.(?:[cm]?[jt]sx?|json)$/.test(file.path)) continue;
			const path = await options.resolveFile(file.path);
			sources.set(path, await readFile(path, "utf8"));
		}
		for (const [file, content] of Object.entries(overlays))
			sources.set(await options.resolveFile(file), content);
		const configFile = resolve(options.rootPath, "tsconfig.json");
		const config = read(configFile);
		const parsed = config
			? ts.parseJsonConfigFileContent(
					ts.parseConfigFileTextToJson(configFile, config).config ?? {},
					{ ...ts.sys, readFile: read },
					options.rootPath,
				)
			: undefined;
		compilerOptions = {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			strict: true,
			allowJs: true,
			skipLibCheck: true,
			...parsed?.options,
			// Preserve explicit types/typeRoots, including empty arrays that deliberately disable ambient defaults.
			typeRoots: parsed?.options.typeRoots ?? [...new Set(defaultTypeRoots)],
			types:
				parsed?.options.types ??
				(parsed?.options.typeRoots === undefined ? ["node"] : undefined),
			noEmit: true,
			allowImportingTsExtensions: true,
			resolveJsonModule: true,
			paths: {
				...parsed?.options.paths,
				"@husky-di/example-remote-lab/sdk": [
					resolve(platformSource, "interfaces/platform/lab-case.interface.ts"),
				],
			},
		};
		files = [...sources.keys()].filter((path) => /\.[cm]?[jt]sx?$/.test(path));
		const nextConfiguration = JSON.stringify(compilerOptions);
		if (!service || configuration !== nextConfiguration) {
			service?.dispose();
			service = ts.createLanguageService(host);
			configuration = nextConfiguration;
		}
	};
	const sourcePath = (path: string) => {
		const local = relative(options.rootPath, path);
		return local.startsWith(`..${sep}`) || isAbsolute(local)
			? path
			: local.split(sep).join("/");
	};
	const positionIn = (path: string, position: number) => {
		if (
			!Number.isInteger(position) ||
			position < 0 ||
			position > (read(path)?.length ?? 0)
		)
			throw new Error("Language position is outside the source file");
		return position;
	};
	return {
		diagnostics: (overlays) =>
			serial(async () => {
				await refresh(overlays);
				return files.flatMap((path) =>
					[
						...service.getSyntacticDiagnostics(path),
						...service.getSemanticDiagnostics(path),
					].map((diagnostic) => ({
						path: sourcePath(diagnostic.file?.fileName ?? path),
						start: diagnostic.start ?? 0,
						length: diagnostic.length ?? 0,
						code: diagnostic.code,
						message: ts.flattenDiagnosticMessageText(
							diagnostic.messageText,
							"\n",
						),
						category: ts.DiagnosticCategory[diagnostic.category].toLowerCase(),
					})),
				);
			}),
		completions: (file, position, overlays) =>
			serial(async () => {
				await refresh(overlays);
				const path = await options.resolveFile(file);
				return (
					service.getCompletionsAtPosition(path, positionIn(path, position), {
						includeCompletionsForModuleExports: true,
					})?.entries ?? []
				).map((entry) => ({
					name: entry.name,
					kind: entry.kind,
					sortText: entry.sortText,
					...(entry.insertText ? { insertText: entry.insertText } : {}),
					...(entry.replacementSpan
						? { replacementSpan: entry.replacementSpan }
						: {}),
				}));
			}),
		definitions: (file, position, overlays) =>
			serial(async () => {
				await refresh(overlays);
				const path = await options.resolveFile(file);
				return (
					service.getDefinitionAtPosition(path, positionIn(path, position)) ??
					[]
				).map((definition) => {
					navigation.add(definition.fileName);
					return {
						path: sourcePath(definition.fileName),
						start: definition.textSpan.start,
						length: definition.textSpan.length,
						name: definition.name,
					};
				});
			}),
		async readDefinition(path) {
			const absolute = isAbsolute(path)
				? resolve(path)
				: await options.resolveFile(path);
			if (isAbsolute(path) && !navigation.has(absolute))
				throw new Error(
					"Only sources returned by definition navigation may be read outside the project",
				);
			const content = await readFile(absolute, "utf8");
			return {
				path,
				content,
				revision: createHash("sha256").update(content).digest("hex"),
			};
		},
		dispose() {
			service?.dispose();
		},
	};
}
