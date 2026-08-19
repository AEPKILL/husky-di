/**
 * @overview Release-gate validation for the Remote RPC requirement matrix.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { readFileSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(
	fileURLToPath(new URL("../../../", import.meta.url)),
);
const specificationPath = resolve(
	repositoryRoot,
	"packages/remote/docs/SPECIFICATION.md",
);
const matrixPath = resolve(
	repositoryRoot,
	"packages/remote/docs/REQUIREMENTS.md",
);
const normativeRuntimePath = resolve(
	repositoryRoot,
	"packages/remote/tests/specification.test.ts",
);
const canonicalIdPattern = /^RPC-[A-Z]+-[0-9]{3}$/;
const allowedEvidenceKinds = new Set([
	"RT",
	"TY",
	"RW",
	"TX",
	"KA",
	"RP",
	"PC",
	"AC",
	"PK",
	"BR",
	"IR",
]);

type RequirementRow = {
	readonly id: string;
	readonly kinds: readonly string[];
	readonly references: readonly string[];
	readonly status: string;
};

function getSpecificationIds(source: string): readonly string[] {
	return [...source.matchAll(/^\*\*(RPC-[A-Z]+-[0-9]{3})\s+—/gmu)].map(
		([, id]) => id as string,
	);
}

function getRequirementRows(source: string): readonly RequirementRow[] {
	return source
		.split("\n")
		.filter((line) => /^\| `RPC-[A-Z]+-[0-9]{3}` \|/u.test(line))
		.map((line) => {
			const [, idCell, , kindsCell, referencesCell, statusCell] = line
				.split("|")
				.map((cell) => cell.trim());
			return {
				id: (idCell as string).slice(1, -1),
				kinds:
					kindsCell === "—"
						? []
						: (kindsCell as string).split(",").map((kind) => kind.trim()),
				references:
					referencesCell === "—"
						? []
						: (referencesCell as string)
								.split("<br>")
								.map((reference) => reference.trim().replace(/^`|`$/gu, "")),
				status: statusCell as string,
			};
		});
}

function getNormativeTestTitles(source: string): readonly string[] {
	return [
		...source.matchAll(/\bit(?:\.each\([\s\S]*?\))?\(\s*"([^"]+)"/gu),
	].map(([, title]) => title as string);
}

function findJsonEvidence(value: unknown, selector: string): unknown {
	if (typeof value !== "object" || value === null) {
		return undefined;
	}
	if ("id" in value && (value as { readonly id?: unknown }).id === selector) {
		return value;
	}
	for (const child of Array.isArray(value) ? value : Object.values(value)) {
		const match = findJsonEvidence(child, selector);
		if (match !== undefined) {
			return match;
		}
	}
	return undefined;
}

function validateReference(
	requirementId: string,
	reference: string,
	diagnostics: string[],
): string | undefined {
	const match = /^(RT|TY|RW|TX|KA|RP|PC|AC|PK|BR|IR)::([^:]+)::(.+)$/u.exec(
		reference,
	);
	if (match === null) {
		diagnostics.push(
			`${requirementId}: malformed evidence reference ${JSON.stringify(reference)}`,
		);
		return undefined;
	}
	const [, kind, repositoryPath, selector] = match as unknown as readonly [
		string,
		string,
		string,
		string,
	];
	const evidencePath = resolve(repositoryRoot, repositoryPath);
	if (!evidencePath.startsWith(`${repositoryRoot}${sep}`)) {
		diagnostics.push(`${requirementId}: evidence escapes the repository`);
		return kind;
	}
	try {
		if (!statSync(evidencePath).isFile()) {
			diagnostics.push(
				`${requirementId}: evidence is not a file: ${repositoryPath}`,
			);
			return kind;
		}
	} catch {
		diagnostics.push(
			`${requirementId}: evidence file is missing: ${repositoryPath}`,
		);
		return kind;
	}

	const source = readFileSync(evidencePath, "utf8");
	if (repositoryPath.endsWith(".json")) {
		let evidence: unknown;
		try {
			evidence = findJsonEvidence(JSON.parse(source), selector);
		} catch {
			diagnostics.push(
				`${requirementId}: evidence JSON is invalid: ${repositoryPath}`,
			);
			return kind;
		}
		if (evidence === undefined) {
			diagnostics.push(
				`${requirementId}: JSON selector does not resolve: ${repositoryPath}#${selector}`,
			);
		} else {
			const covers = (evidence as { readonly covers?: unknown }).covers;
			if (!Array.isArray(covers) || !covers.includes(requirementId)) {
				diagnostics.push(
					`${requirementId}: JSON selector does not canonically cover the requirement: ${repositoryPath}#${selector}`,
				);
			}
		}
	} else {
		if (!selector.includes(requirementId)) {
			diagnostics.push(
				`${requirementId}: text selector omits the full canonical ID: ${selector}`,
			);
		}
		if (!source.includes(selector)) {
			diagnostics.push(
				`${requirementId}: text selector does not resolve: ${repositoryPath}#${selector}`,
			);
		}
	}
	return kind;
}

describe("Remote RPC requirement evidence", () => {
	it("RPC-EVIDENCE-003 keeps the normative runtime entry on canonical public seams", () => {
		const source = readFileSync(normativeRuntimePath, "utf8");
		const titles = getNormativeTestTitles(source);
		const testCallCount = [...source.matchAll(/\bit(?:\.each)?\(/gu)].length;
		const sourceImports = [...source.matchAll(/\bfrom\s+"([^"]+)"/gu)].map(
			([, specifier]) => specifier as string,
		);

		expect(titles).toHaveLength(testCallCount);
		expect(titles.length).toBeGreaterThan(0);
		expect(
			titles.filter((title) => !/\bRPC-[A-Z]+-[0-9]{3}\b/u.test(title)),
		).toEqual([]);
		expect(
			sourceImports.filter(
				(specifier) =>
					specifier.startsWith("../src/") &&
					!new Set([
						"../src/conformance",
						"../src/index",
						"../src/protocol",
						"../src/transport",
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

		expect(specificationIds).toHaveLength(195);
		expect(diagnostics).toEqual([]);
	});
});
