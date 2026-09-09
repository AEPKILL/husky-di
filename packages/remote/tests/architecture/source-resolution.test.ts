/**
 * @overview Verifies source resolution.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	createSourceCompilerOptions,
	createSourceGraph,
	findCycles,
	listSourceDependencies,
	packageCompilerOptions,
	resolveSourceImport,
} from "./test.utils";

describe("Remote package dependency direction", () => {
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
});
