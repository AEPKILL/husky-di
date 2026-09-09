/**
 * @overview Verifies requirements.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	allowedEvidenceKinds,
	canonicalIdPattern,
	getNormativeTestTitles,
	getRequirementRows,
	getSpecificationIds,
	matrixPath,
	normativeRuntimePath,
	repositoryRoot,
	specificationPath,
	validateReference,
} from "./requirements/evidence/test.utils";

describe("Remote RPC requirement evidence", () => {
	it("RPC-EVIDENCE-003 keeps the normative runtime entry on canonical public seams", () => {
		const entrySource = readFileSync(normativeRuntimePath, "utf8");
		const suiteDirectory = resolve(
			dirname(normativeRuntimePath),
			"specification",
		);
		const entries = readdirSync(suiteDirectory);
		const importedSuites = [
			...entrySource.matchAll(/^import "\.\/specification\/([^"]+)";/gmu),
		].map(([, name]) => `${name}.ts`);
		expect(importedSuites.sort()).toEqual(
			entries.filter((name) => name.endsWith(".test.ts")).sort(),
		);
		const sources = [
			normativeRuntimePath,
			...entries.map((name) => resolve(suiteDirectory, name)),
		].map((path) => ({ path, source: readFileSync(path, "utf8") }));
		const source = sources.map(({ source }) => source).join("\n");
		const titles = getNormativeTestTitles(source);
		const testCallCount = [...source.matchAll(/\bit(?:\.each)?\(/gu)].length;
		const sourceImports = sources.flatMap(({ path, source }) =>
			[...source.matchAll(/\bfrom\s+"([^"]+)"/gu)].map(([, specifier]) =>
				resolve(dirname(path), specifier as string),
			),
		);
		const sourceRoot = resolve(repositoryRoot, "packages/remote/src");

		expect(titles).toHaveLength(testCallCount);
		expect(titles.length).toBeGreaterThan(0);
		expect(
			titles.filter((title) => !/\bRPC-[A-Z]+-[0-9]{3}\b/u.test(title)),
		).toEqual([]);
		expect(
			sourceImports.filter(
				(specifier) =>
					specifier.startsWith(`${sourceRoot}/`) &&
					!new Set([
						resolve(sourceRoot, "conformance"),
						resolve(sourceRoot, "index"),
						resolve(sourceRoot, "protocol"),
						resolve(sourceRoot, "transport"),
					]).has(specifier),
			),
		).toEqual([]);
	});

	it("RPC-EVIDENCE-001 RPC-EVIDENCE-002 closes one precise verified evidence row per normative requirement", () => {
		const specificationIds = getSpecificationIds(
			readFileSync(specificationPath, "utf8"),
		);
		const rows = getRequirementRows(readFileSync(matrixPath, "utf8"));
		const diagnostics: string[] = [];
		const specificationIdSet = new Set(specificationIds);
		const rowCounts = new Map<string, number>();

		for (const id of specificationIds) {
			if (!canonicalIdPattern.test(id)) {
				diagnostics.push(`Specification has a malformed requirement ID: ${id}`);
			}
		}
		if (specificationIdSet.size !== specificationIds.length) {
			diagnostics.push("Specification requirement IDs are not unique");
		}

		for (const row of rows) {
			rowCounts.set(row.id, (rowCounts.get(row.id) ?? 0) + 1);
			if (!specificationIdSet.has(row.id)) {
				diagnostics.push(`${row.id}: matrix row has no normative requirement`);
			}
			if (row.kinds.length === 0) {
				diagnostics.push(`${row.id}: has no evidence kind`);
			}
			if (new Set(row.kinds).size !== row.kinds.length) {
				diagnostics.push(`${row.id}: repeats an evidence kind`);
			}
			for (const kind of row.kinds) {
				if (!allowedEvidenceKinds.has(kind)) {
					diagnostics.push(`${row.id}: unsupported evidence kind ${kind}`);
				}
			}

			if (row.references.length === 0) {
				diagnostics.push(`${row.id}: has no concrete evidence reference`);
			}
			const resolvedKinds = row.references
				.map((reference) => validateReference(row.id, reference, diagnostics))
				.filter((kind): kind is string => kind !== undefined);
			if (
				row.kinds.some((kind) => !resolvedKinds.includes(kind)) ||
				resolvedKinds.some((kind) => !row.kinds.includes(kind))
			) {
				diagnostics.push(
					`${row.id}: declared evidence kinds do not match its references`,
				);
			}
			if (row.status !== "verified") {
				diagnostics.push(
					`${row.id}: status is ${row.status}, expected verified`,
				);
			}
		}

		for (const id of specificationIds) {
			if (rowCounts.get(id) !== 1) {
				diagnostics.push(
					`${id}: expected exactly one matrix row, found ${rowCounts.get(id) ?? 0}`,
				);
			}
		}

		expect(specificationIds).toHaveLength(200);
		expect(diagnostics).toEqual([]);
	});
});
