/**
 * @overview Verifies dependency direction.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
	createSourceGraph,
	findCycles,
	isAllowedImplementationImport,
	isImplementation,
	listSourceDependencies,
	listTypeScriptFiles,
	packagePath,
	packageRoot,
	readPackageSources,
	resolveSourceDependency,
	sourceOwner,
	sourceRoot,
} from "./test.utils";

describe("Remote package dependency direction", () => {
	it("keeps Remote source and test files within 500 lines", () => {
		const roots = [packageRoot, resolve(packageRoot, "../remote-websocket")];
		const oversized = roots.flatMap((root) =>
			["src", "tests"].flatMap((directory) =>
				listTypeScriptFiles(resolve(root, directory)).flatMap((path) => {
					const lines = readFileSync(path, "utf8").trimEnd().split("\n").length;
					return lines > 500 ? [`${packagePath(path)}: ${lines}`] : [];
				}),
			),
		);
		expect(oversized).toEqual([]);
	});

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
});

describe("Remote package dependency direction", () => {
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
