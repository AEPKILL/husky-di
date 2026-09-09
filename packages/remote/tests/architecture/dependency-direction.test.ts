/**
 * @overview Guards Remote module dependency direction, assembly seams, and public boundaries.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

type SourceGraph = ReadonlyMap<string, ReadonlySet<string>>;

type SourceDependency = Readonly<
	| { readonly kind: "amd" | "lib" | "module" | "path"; readonly name: string }
	| {
			readonly kind: "types";
			readonly name: string;
			readonly resolutionMode: ts.ResolutionMode;
	  }
>;

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(packageRoot, "src");
const packageCompilerOptions = readPackageCompilerOptions();

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

function listTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? listTypeScriptFiles(path)
			: /\.(?:cts|mts|tsx?)$/u.test(entry.name)
				? [path]
				: [];
	});
}

function listSourceDependencies(
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

function resolveSourceImport(
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

function resolveSourceDependency(
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

function createSourceCompilerOptions(root: string): ts.CompilerOptions {
	return {
		...packageCompilerOptions,
		paths: { "@/*": [`${root}/*`] },
		rootDir: root,
	};
}

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

function createSourceGraph(
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

function findCycles(graph: SourceGraph): string[][] {
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

function requireNumber(value: number | undefined): number {
	if (value === undefined) {
		throw new Error("Expected an SCC traversal index.");
	}
	return value;
}

function packagePath(path: string): string {
	return relative(packageRoot, path).split(sep).join("/");
}

function isImplementation(path: string): boolean {
	return path.endsWith(".impl.ts");
}

function isAllowedImplementationImport(
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

function readPackageSources(): ReadonlyMap<string, string> {
	return new Map(
		listTypeScriptFiles(sourceRoot).map((path) => [
			path,
			readFileSync(path, "utf8"),
		]),
	);
}

describe("Remote package dependency direction", () => {
	it("keeps the module dependency graph acyclic including type imports", () => {
		const sourceGraph = createSourceGraph(sourceRoot, readPackageSources());
		const modules = new Map<string, Set<string>>();
		for (const [importer, targets] of sourceGraph) {
			const owner = sourceOwner(importer);
			if (owner === undefined) continue;
			const dependencies = modules.get(owner) ?? new Set<string>();
			modules.set(owner, dependencies);
			for (const target of targets) {
				const dependency = sourceOwner(target);
				if (dependency !== undefined && dependency !== owner) {
					dependencies.add(dependency);
				}
			}
		}
		expect(findCycles(modules)).toEqual([]);
		const allowed = new Map<string, ReadonlySet<string>>([
			["owner", new Set(["peer", "protocol", "transport", "shared"])],
			["peer", new Set(["protocol", "shared"])],
			["protocol", new Set(["transport", "shared"])],
			["reconnection", new Set(["owner", "peer", "transport", "shared"])],
			["transport", new Set(["shared"])],
			["shared", new Set()],
		]);
		const violations = [...modules].flatMap(([owner, targets]) =>
			[...targets]
				.filter((target) => !allowed.get(owner)?.has(target))
				.map((target) => `${owner} -> ${target}`),
		);
		expect(violations).toEqual([]);
	});

	it("detects multi-node and self cycles made only from type edges", () => {
		const fixtureRoot = resolve("/virtual/remote/src");
		const typeA = resolve(fixtureRoot, "type-a.ts");
		const typeB = resolve(fixtureRoot, "nested/type-b.ts");
		const self = resolve(fixtureRoot, "self.ts");
		const graph = createSourceGraph(
			fixtureRoot,
			new Map([
				[typeA, 'type TypeA = import("./nested/type-b").TypeB;'],
				[typeB, 'import type { TypeA } from "@/type-a";'],
				[self, 'type Self = import("./self").Self;'],
			]),
		);

		expect(findCycles(graph)).toEqual([[typeB, typeA], [self]]);
	});

	it("detects a declaration cycle through a types reference directive", () => {
		const fixtureRoot = resolve("/virtual/type-reference/src");
		const a = resolve(fixtureRoot, "a.d.ts");
		const b = resolve(fixtureRoot, "b.d.ts");
		const sources = new Map([
			[a, '/// <reference types="./b" />\nexport type A = true;'],
			[b, 'export type { A } from "./a.js";'],
		]);
		const graph = createSourceGraph(fixtureRoot, sources);

		expect(listSourceDependencies(sources.get(a) ?? "", a)).toContainEqual({
			kind: "types",
			name: "./b",
			resolutionMode: undefined,
		});
		expect(graph.get(a)).toEqual(new Set([b]));
		expect(graph.get(b)).toEqual(new Set([a]));
		expect(findCycles(graph)).toEqual([[a, b]]);
	});

	it("audits lib and AMD directives that cannot load local package source", () => {
		const fixtureRoot = resolve("/virtual/directive-audit/src");
		const entry = resolve(fixtureRoot, "entry.d.ts");
		const localLib = resolve(fixtureRoot, "lib.es2020.d.ts");
		const amdTarget = resolve(fixtureRoot, "amd-target.ts");
		const sources = new Map([
			[
				entry,
				[
					'/// <reference lib="es2020" />',
					'/// <amd-dependency path="./amd-target" name="target" />',
					"export type Entry = true;",
				].join("\n"),
			],
			[localLib, "export type LocalLib = true;"],
			[amdTarget, "export type AmdTarget = true;"],
		]);
		const dependencies = listSourceDependencies(
			sources.get(entry) ?? "",
			entry,
		);
		const options = { ...createSourceCompilerOptions(fixtureRoot), lib: [] };
		const systemHost = ts.createCompilerHost(options, true);
		const compilerHost: ts.CompilerHost = {
			...systemHost,
			fileExists: (path) => sources.has(path) || systemHost.fileExists(path),
			getCurrentDirectory: () => fixtureRoot,
			getSourceFile: (
				path,
				languageVersionOrOptions,
				onError,
				shouldCreateNewSourceFile,
			) => {
				const source = sources.get(path);
				return source === undefined
					? systemHost.getSourceFile(
							path,
							languageVersionOrOptions,
							onError,
							shouldCreateNewSourceFile,
						)
					: ts.createSourceFile(path, source, languageVersionOrOptions, true);
			},
			readFile: (path) => sources.get(path) ?? systemHost.readFile(path),
		};
		const program = ts.createProgram({
			rootNames: [entry],
			options,
			host: compilerHost,
		});

		expect(packageCompilerOptions.module).toBe(ts.ModuleKind.ESNext);
		expect(dependencies).toContainEqual({ kind: "lib", name: "es2020" });
		expect(dependencies).toContainEqual({
			kind: "amd",
			name: "./amd-target",
		});
		expect(program.getSourceFile(entry)).toBeDefined();
		expect(program.getSourceFile(localLib)).toBeUndefined();
		expect(
			program
				.getSourceFiles()
				.some(
					({ fileName }) =>
						fileName !== localLib && fileName.endsWith("/lib.es2020.d.ts"),
				),
		).toBe(true);
		expect(program.getSourceFile(amdTarget)).toBeUndefined();
		expect(createSourceGraph(fixtureRoot, sources).get(entry)).toEqual(
			new Set(),
		);
	});

	it("resolves every claimed TypeScript dependency syntax", () => {
		const fixtureRoot = resolve("/virtual/syntax/src");
		const entry = resolve(fixtureRoot, "entry.ts");
		const targets = [
			"reference.ts",
			"imported.ts",
			"import-type.ts",
			"exported.ts",
			"export-type.ts",
			"type-query.ts",
			"dynamic.ts",
			"import-equals.ts",
			"required.cts",
		].map((name) => resolve(fixtureRoot, name));
		const graph = createSourceGraph(
			fixtureRoot,
			new Map([
				[
					entry,
					[
						'/// <reference path="./reference.ts" />',
						'import "./imported.js";',
						'import type { Imported } from "./import-type.js";',
						'export { exported } from "./exported.js";',
						'export type { Exported } from "./export-type.js";',
						'type Queried = import("./type-query.js").Queried;',
						'const dynamic = import("./dynamic.js");',
						'import Equal = require("./import-equals.js");',
						'const required = require("./required.cjs");',
						"void dynamic; void required;",
					].join("\n"),
				],
				...targets.map(
					(target) => [target, "export type Marker = true;"] as const,
				),
			]),
		);

		expect([...new Set(graph.get(entry))].sort()).toEqual(targets.sort());
	});

	it("keeps Node runtime extensions paired with mts and cts despite ts decoys", () => {
		const fixtureRoot = resolve("/virtual/extensions/src");
		const aMts = resolve(fixtureRoot, "a.mts");
		const bMts = resolve(fixtureRoot, "b.mts");
		const aCts = resolve(fixtureRoot, "a.cts");
		const bCts = resolve(fixtureRoot, "b.cts");
		const aTs = resolve(fixtureRoot, "a.ts");
		const bTs = resolve(fixtureRoot, "b.ts");
		const graph = createSourceGraph(
			fixtureRoot,
			new Map([
				[aMts, 'import type { B } from "./b.mjs";'],
				[bMts, 'export type { A } from "./a.mjs";'],
				[aCts, 'import B = require("./b.cjs");'],
				[bCts, 'type A = import("./a.cjs").A;'],
				[aTs, "export type DecoyA = true;"],
				[bTs, "export type DecoyB = true;"],
			]),
		);

		expect(graph.get(aMts)).toEqual(new Set([bMts]));
		expect(graph.get(bMts)).toEqual(new Set([aMts]));
		expect(graph.get(aCts)).toEqual(new Set([bCts]));
		expect(graph.get(bCts)).toEqual(new Set([aCts]));
		expect(findCycles(graph)).toEqual([
			[aCts, bCts],
			[aMts, bMts],
		]);
	});

	it("applies declaration and JavaScript source substitutions in compiler order", () => {
		const fixtureRoot = resolve("/virtual/substitutions/src");
		const entry = resolve(fixtureRoot, "entry.mts");
		const declarationMts = resolve(fixtureRoot, "esm-only.d.mts");
		const declarationCts = resolve(fixtureRoot, "cjs-only.d.cts");
		const javascriptTs = resolve(fixtureRoot, "javascript.ts");
		const jsxTsx = resolve(fixtureRoot, "component.tsx");
		const decoys = [
			resolve(fixtureRoot, "esm-only.ts"),
			resolve(fixtureRoot, "cjs-only.ts"),
			resolve(fixtureRoot, "javascript.mts"),
			resolve(fixtureRoot, "component.ts"),
		];
		const graph = createSourceGraph(
			fixtureRoot,
			new Map([
				[
					entry,
					[
						'import type { Esm } from "./esm-only.mjs";',
						'import type { Cjs } from "./cjs-only.cjs";',
						'import type { Javascript } from "./javascript.js";',
						'import type { Component } from "./component.jsx";',
					].join("\n"),
				],
				[declarationMts, "export type Esm = true;"],
				[declarationCts, "export type Cjs = true;"],
				[javascriptTs, "export type Javascript = true;"],
				[jsxTsx, "export type Component = true;"],
				...decoys.map((path) => [path, "export type Decoy = true;"] as const),
			]),
		);

		expect(graph.get(entry)).toEqual(
			new Set([declarationMts, declarationCts, javascriptTs, jsxTsx]),
		);
	});

	it("uses bundler extensionless resolution and ignores mts and cts decoys", () => {
		const fixtureRoot = resolve("/virtual/extensionless/src");
		const a = resolve(fixtureRoot, "a.ts");
		const declaration = resolve(fixtureRoot, "b.d.ts");
		const mtsDecoy = resolve(fixtureRoot, "b.mts");
		const ctsDecoy = resolve(fixtureRoot, "b.cts");
		const unresolvedEntry = resolve(fixtureRoot, "unresolved.ts");
		const mtsOnly = resolve(fixtureRoot, "mts-only.mts");
		const ctsOnly = resolve(fixtureRoot, "cts-only.cts");
		const sources = new Map([
			[a, 'import type { B } from "./b";'],
			[declaration, 'export type { A } from "./a.js";'],
			[mtsDecoy, "export type MtsDecoy = true;"],
			[ctsDecoy, "export type CtsDecoy = true;"],
			[
				unresolvedEntry,
				[
					'import type { Mts } from "./mts-only";',
					'import type { Cts } from "./cts-only";',
				].join("\n"),
			],
			[mtsOnly, "export type Mts = true;"],
			[ctsOnly, "export type Cts = true;"],
		]);
		const sourceFiles = new Set(sources.keys());
		const graph = createSourceGraph(fixtureRoot, sources);

		expect(resolveSourceImport(a, "./b", fixtureRoot, sourceFiles)).toBe(
			declaration,
		);
		expect(
			resolveSourceImport(
				unresolvedEntry,
				"./mts-only",
				fixtureRoot,
				sourceFiles,
			),
		).toBeUndefined();
		expect(
			resolveSourceImport(
				unresolvedEntry,
				"./cts-only",
				fixtureRoot,
				sourceFiles,
			),
		).toBeUndefined();
		expect(graph.get(a)).toEqual(new Set([declaration]));
		expect(graph.get(unresolvedEntry)).toEqual(new Set());
		expect(findCycles(graph)).toEqual([[a, declaration]]);
	});

	it("allows concrete imports only from assembly factories, module indexes, and the Protocol implementation DAG", () => {
		const sources = readPackageSources();
		const sourceFiles = new Set(sources.keys());
		const violations = [...sources].flatMap(([importer, source]) =>
			listSourceDependencies(source, importer).flatMap((dependency) => {
				const target = resolveSourceDependency(
					importer,
					dependency,
					sourceRoot,
					sourceFiles,
				);
				if (
					target === undefined ||
					!isImplementation(target) ||
					isAllowedImplementationImport(importer, target)
				) {
					return [];
				}
				return [`${packagePath(importer)} -> ${packagePath(target)}`];
			}),
		);

		expect(violations).toEqual([]);
	});

	it("requires cross-module references from source and tests to use module entrypoints", () => {
		const sources = new Map([
			...readPackageSources(),
			...listTypeScriptFiles(resolve(packageRoot, "tests")).map(
				(path) => [path, readFileSync(path, "utf8")] as const,
			),
		]);
		const files = new Set(sources.keys());
		const violations = [...sources].flatMap(([importer, source]) =>
			listSourceDependencies(source, importer).flatMap((dependency) => {
				const target = resolveSourceDependency(
					importer,
					dependency,
					sourceRoot,
					files,
				);
				if (
					target === undefined ||
					!packagePath(target).startsWith("src/modules/")
				)
					return [];
				const isExternal = sourceOwner(importer) !== sourceOwner(target);
				return isExternal && !target.endsWith(`${sep}index.ts`)
					? [`${packagePath(importer)} -> ${packagePath(target)}`]
					: [];
			}),
		);
		expect(violations).toEqual([]);
	});

	it("keeps behavioral contracts independent of concrete implementations and assembly", () => {
		const graph = createSourceGraph(sourceRoot, readPackageSources());
		const violations = [...graph].flatMap(([importer, targets]) => {
			if (!/\/(?:interfaces|types)\//u.test(packagePath(importer))) return [];
			return [...targets]
				.filter(
					(target) =>
						isImplementation(target) ||
						packagePath(target).includes("/factories/"),
				)
				.map((target) => `${packagePath(importer)} -> ${packagePath(target)}`);
		});
		expect(violations).toEqual([]);
	});

	it("keeps concrete implementations and test constructors outside declared package entrypoints", () => {
		for (const entry of [
			"index.ts",
			"protocol.ts",
			"transport.ts",
			"conformance.ts",
		]) {
			const path = resolve(sourceRoot, entry);
			const source = ts.createSourceFile(
				path,
				readFileSync(path, "utf8"),
				ts.ScriptTarget.Latest,
				true,
			);
			const exports = source.statements.flatMap((statement) => {
				if (!ts.isExportDeclaration(statement) || statement.isTypeOnly)
					return [];
				expect(
					statement.exportClause,
					`${entry}: wildcard export bypasses the public boundary`,
				).toBeDefined();
				return statement.exportClause !== undefined &&
					ts.isNamedExports(statement.exportClause)
					? statement.exportClause.elements
							.filter((element) => !element.isTypeOnly)
							.map((element) => element.name.text)
					: [];
			});
			expect(
				exports.filter((name) => /(?:Impl|ForTest)$/u.test(name)),
				entry,
			).toEqual([]);
		}
	});
});

function sourceOwner(path: string): string | undefined {
	const relativePath = packagePath(path);
	if (relativePath.startsWith("src/shared/")) return "shared";
	return /^src\/modules\/([^/]+)\//u.exec(relativePath)?.[1];
}
