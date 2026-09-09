/**
 * @overview Shared architecture/dependency-direction fixtures.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

export const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../..",
);

export const sourceRoot = resolve(packageRoot, "src");

export const packageCompilerOptions = readPackageCompilerOptions();

export function listTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? listTypeScriptFiles(path)
			: /\.(?:cts|mts|tsx?)$/u.test(entry.name)
				? [path]
				: [];
	});
}

export function listSourceDependencies(
	source: string,
	path: string,
): SourceDependency[] {
	const sourceFile = ts.createSourceFile(
		path,
		source,
		ts.ScriptTarget.Latest,
		true,
	);
	const dependencies: SourceDependency[] = [
		...sourceFile.referencedFiles.map(({ fileName }) => ({
			kind: "path" as const,
			name: fileName,
		})),
		...sourceFile.typeReferenceDirectives.map(
			({ fileName, resolutionMode }) => ({
				kind: "types" as const,
				name: fileName,
				resolutionMode,
			}),
		),
		...sourceFile.libReferenceDirectives.map(({ fileName }) => ({
			kind: "lib" as const,
			name: fileName,
		})),
		...sourceFile.amdDependencies.map(({ path: dependencyPath }) => ({
			kind: "amd" as const,
			name: dependencyPath,
		})),
	];
	const visit = (node: ts.Node): void => {
		if (
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier !== undefined &&
			ts.isStringLiteralLike(node.moduleSpecifier)
		) {
			dependencies.push({ kind: "module", name: node.moduleSpecifier.text });
		} else if (
			ts.isImportEqualsDeclaration(node) &&
			ts.isExternalModuleReference(node.moduleReference) &&
			node.moduleReference.expression !== undefined &&
			ts.isStringLiteralLike(node.moduleReference.expression)
		) {
			dependencies.push({
				kind: "module",
				name: node.moduleReference.expression.text,
			});
		} else if (
			ts.isImportTypeNode(node) &&
			ts.isLiteralTypeNode(node.argument) &&
			ts.isStringLiteralLike(node.argument.literal)
		) {
			dependencies.push({ kind: "module", name: node.argument.literal.text });
		} else if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require"))
		) {
			const [argument] = node.arguments;
			if (argument !== undefined && ts.isStringLiteralLike(argument)) {
				dependencies.push({ kind: "module", name: argument.text });
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return dependencies;
}

export function resolveSourceImport(
	importer: string,
	specifier: string,
	root: string,
	sourceFiles: ReadonlySet<string>,
): string | undefined {
	if (!specifier.startsWith("@/") && !specifier.startsWith(".")) {
		return undefined;
	}
	const resolved = ts.resolveModuleName(
		specifier,
		importer,
		createSourceCompilerOptions(root),
		createSourceResolutionHost(root, sourceFiles),
	).resolvedModule?.resolvedFileName;
	return resolved !== undefined && sourceFiles.has(resolved)
		? resolved
		: undefined;
}

export function resolveSourceDependency(
	importer: string,
	dependency: SourceDependency,
	root: string,
	sourceFiles: ReadonlySet<string>,
): string | undefined {
	switch (dependency.kind) {
		case "module":
			return resolveSourceImport(importer, dependency.name, root, sourceFiles);
		case "path": {
			const resolved = ts.resolveTripleslashReference(
				dependency.name,
				importer,
			);
			return sourceFiles.has(resolved) ? resolved : undefined;
		}
		case "types": {
			const resolved = ts.resolveTypeReferenceDirective(
				dependency.name,
				importer,
				createSourceCompilerOptions(root),
				createSourceResolutionHost(root, sourceFiles),
				undefined,
				undefined,
				dependency.resolutionMode,
			).resolvedTypeReferenceDirective?.resolvedFileName;
			return resolved !== undefined && sourceFiles.has(resolved)
				? resolved
				: undefined;
		}
		case "amd":
			// ESNext output neither loads nor emits legacy AMD dependency pragmas.
			return packageCompilerOptions.module === ts.ModuleKind.AMD ||
				packageCompilerOptions.module === ts.ModuleKind.UMD
				? resolveSourceImport(importer, dependency.name, root, sourceFiles)
				: undefined;
		case "lib":
			// Lib names resolve only through TypeScript's compiler-owned lib map.
			return undefined;
	}
}

export function createSourceCompilerOptions(root: string): ts.CompilerOptions {
	return {
		...packageCompilerOptions,
		paths: { "@/*": [`${root}/*`] },
		rootDir: root,
	};
}

export function createSourceGraph(
	root: string,
	sources: ReadonlyMap<string, string>,
): SourceGraph {
	const sourceFiles = new Set(sources.keys());
	return new Map(
		[...sources].map(([importer, source]) => [
			importer,
			new Set(
				listSourceDependencies(source, importer).flatMap((dependency) => {
					const target = resolveSourceDependency(
						importer,
						dependency,
						root,
						sourceFiles,
					);
					return target === undefined ? [] : [target];
				}),
			),
		]),
	);
}

export function findCycles(graph: SourceGraph): string[][] {
	let nextIndex = 0;
	const indexes = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	const stack: string[] = [];
	const stacked = new Set<string>();
	const components: string[][] = [];

	const visit = (node: string): void => {
		const index = nextIndex;
		nextIndex += 1;
		indexes.set(node, index);
		lowLinks.set(node, index);
		stack.push(node);
		stacked.add(node);

		for (const target of graph.get(node) ?? []) {
			if (!indexes.has(target)) {
				visit(target);
				lowLinks.set(
					node,
					Math.min(
						requireNumber(lowLinks.get(node)),
						requireNumber(lowLinks.get(target)),
					),
				);
			} else if (stacked.has(target)) {
				lowLinks.set(
					node,
					Math.min(
						requireNumber(lowLinks.get(node)),
						requireNumber(indexes.get(target)),
					),
				);
			}
		}

		if (lowLinks.get(node) !== indexes.get(node)) {
			return;
		}
		const component: string[] = [];
		let member: string | undefined;
		do {
			member = stack.pop();
			if (member === undefined) {
				throw new Error("SCC stack ended before its root.");
			}
			stacked.delete(member);
			component.push(member);
		} while (member !== node);
		const first = component[0];
		const selfCycle =
			component.length === 1 &&
			first !== undefined &&
			graph.get(first)?.has(first) === true;
		if (component.length > 1 || selfCycle) {
			components.push(component.sort());
		}
	};

	for (const node of [...graph.keys()].sort()) {
		if (!indexes.has(node)) {
			visit(node);
		}
	}
	return components.sort(([left = ""], [right = ""]) =>
		left.localeCompare(right),
	);
}

export function packagePath(path: string): string {
	return relative(packageRoot, path).split(sep).join("/");
}

export function isImplementation(path: string): boolean {
	return path.endsWith(".impl.ts");
}

export function isAllowedImplementationImport(
	importer: string,
	target: string,
): boolean {
	const from = packagePath(importer);
	const to = packagePath(target);
	return (
		from.includes("/factories/") ||
		/^src\/modules\/[^/]+\/index\.ts$/u.test(from) ||
		allowedImplementationEdges.get(from)?.has(to) === true
	);
}

export function readPackageSources(): ReadonlyMap<string, string> {
	return new Map(
		listTypeScriptFiles(sourceRoot).map((path) => [
			path,
			readFileSync(path, "utf8"),
		]),
	);
}

export function sourceOwner(path: string): string | undefined {
	const relativePath = packagePath(path);
	if (relativePath.startsWith("src/shared/")) return "shared";
	return /^src\/modules\/([^/]+)\//u.exec(relativePath)?.[1];
}

type SourceGraph = ReadonlyMap<string, ReadonlySet<string>>;

type SourceDependency = Readonly<
	| { readonly kind: "amd" | "lib" | "module" | "path"; readonly name: string }
	| {
			readonly kind: "types";
			readonly name: string;
			readonly resolutionMode: ts.ResolutionMode;
	  }
>;

const allowedImplementationEdges = new Map<string, ReadonlySet<string>>([
	[
		"src/modules/protocol/impls/rpc-protocol-connector.impl.ts",
		new Set(["src/modules/protocol/impls/rpc-binding-attempt.impl.ts"]),
	],
	[
		"src/modules/protocol/impls/rpc-protocol-acceptor.impl.ts",
		new Set(["src/modules/protocol/impls/rpc-binding-attempt.impl.ts"]),
	],
	[
		"src/modules/protocol/impls/rpc-binding-attempt.impl.ts",
		new Set(["src/modules/protocol/impls/rpc-endpoint.impl.ts"]),
	],
]);

function createSourceResolutionHost(
	root: string,
	sourceFiles: ReadonlySet<string>,
): ts.ModuleResolutionHost {
	return {
		directoryExists: (directory) =>
			[...sourceFiles].some((path) => path.startsWith(`${directory}${sep}`)),
		fileExists: (path) => sourceFiles.has(path),
		getCurrentDirectory: () => root,
		getDirectories: (directory) =>
			[...sourceFiles]
				.filter((path) => path.startsWith(`${directory}${sep}`))
				.map((path) => dirname(path)),
		readFile: () => undefined,
		realpath: (path) => path,
		useCaseSensitiveFileNames: () => true,
	};
}

function readPackageCompilerOptions(): ts.CompilerOptions {
	const configPath = resolve(packageRoot, "tsconfig.json");
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	if (config.error !== undefined) {
		throw new Error(
			ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
		);
	}
	const parsed = ts.parseJsonConfigFileContent(
		config.config,
		ts.sys,
		packageRoot,
		undefined,
		configPath,
	);
	if (parsed.errors.length > 0) {
		throw new Error(
			parsed.errors
				.map(({ messageText }) =>
					ts.flattenDiagnosticMessageText(messageText, "\n"),
				)
				.join("\n"),
		);
	}
	return parsed.options;
}

function requireNumber(value: number | undefined): number {
	if (value === undefined) {
		throw new Error("Expected an SCC traversal index.");
	}
	return value;
}
