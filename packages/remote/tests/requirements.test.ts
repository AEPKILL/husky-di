/**
 * @overview Release-gate validation for the Remote RPC requirement matrix.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

function readRegistry(name: string): Record<string, unknown> {
	return JSON.parse(
		readFileSync(resolve(packageRoot, `evidence/${name}.json`), "utf8"),
	) as Record<string, unknown>;
}

function getRequirementRows(source: string): readonly string[] {
	return [...source.matchAll(/^\| `(RPC-[A-Z]+-[0-9]{3})` \|/gmu)].map(
		([, id]) => id as string,
	);
}

describe("Remote RPC requirement evidence", () => {
	it("RPC-EVIDENCE-001 RPC-EVIDENCE-013 closes one precise evidence row per normative requirement", () => {
		const audit = spawnSync(
			process.execPath,
			[
				resolve(packageRoot, "scripts/evidence-registry.mjs"),
				"ledger",
				"--legacy-preserve",
				"153",
				"--legacy-retire",
				"48",
				"--active",
				"343",
			],
			{ cwd: packageRoot, encoding: "utf8" },
		);
		const requirements = readRegistry("requirements") as {
			readonly active: readonly { readonly id: string }[];
			readonly retired: readonly { readonly id: string }[];
		};
		const matrix = readRegistry("matrix") as {
			readonly rows: readonly { readonly requirementId: string }[];
		};
		const documentedRows = getRequirementRows(
			readFileSync(resolve(packageRoot, "docs/REQUIREMENTS.md"), "utf8"),
		);
		const activeIds = requirements.active.map(({ id }) => id);
		const retiredIds = requirements.retired.map(({ id }) => id);

		expect(audit.stderr).toBe("");
		expect(audit.status).toBe(0);
		expect(activeIds).toHaveLength(343);
		expect(retiredIds).toHaveLength(48);
		expect(new Set(activeIds).size).toBe(343);
		expect(new Set(retiredIds).size).toBe(48);
		expect(activeIds.filter((id) => retiredIds.includes(id))).toEqual([]);
		expect(matrix.rows.map(({ requirementId }) => requirementId)).toEqual(
			activeIds,
		);
		expect(documentedRows).toHaveLength(343);
		expect(new Set(documentedRows)).toEqual(new Set(activeIds));
	});
});
