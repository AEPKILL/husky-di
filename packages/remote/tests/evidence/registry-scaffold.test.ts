/**
 * @overview Production audits for the immutable Remote RPC evidence registries.
 * @author AEPKILL
 * @created 2026-08-24 21:18:00
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const auditScript = resolve(packageRoot, "scripts/evidence-registry.mjs");

function registry<T>(name: string): T {
	return JSON.parse(
		readFileSync(resolve(packageRoot, `evidence/${name}.json`), "utf8"),
	) as T;
}

function audit(command: "ledger" | "graph", ...args: readonly string[]) {
	return spawnSync(process.execPath, [auditScript, command, ...args], {
		cwd: packageRoot,
		encoding: "utf8",
	});
}

describe("Remote RPC final evidence registries", () => {
	it("RPC-EVIDENCE-004 preserves the immutable legacy requirement and verdict ledgers", () => {
		const result = audit(
			"ledger",
			"--legacy-preserve",
			"153",
			"--legacy-retire",
			"48",
			"--active",
			"343",
		);
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-005 gives every evidence node one globally unique exact selector", () => {
		const evidence = registry<{
			readonly nodes: readonly { readonly selector: string }[];
		}>("evidence");
		const selectors = evidence.nodes.map(({ selector }) => selector);
		expect(selectors).toHaveLength(347);
		expect(new Set(selectors).size).toBe(selectors.length);
		expect(
			selectors.filter((selector) => selector.startsWith("specification:")),
		).toHaveLength(343);
		expect(
			selectors.filter((selector) => selector.startsWith("result:")).sort(),
		).toEqual([
			"result:browser",
			"result:corpus",
			"result:installed-node",
			"result:pack",
		]);
	});

	it("RPC-EVIDENCE-008 keeps every canonical cover nonempty and active", () => {
		const result = audit("graph", "--inverse");
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-009 keeps case-matrix and case-evidence edges exact inverses", () => {
		const result = audit("graph", "--inverse");
		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-010 keeps canonical, support-only, and retired Case classes disjoint", () => {
		const cases = registry<{
			readonly canonical: readonly { readonly id: string }[];
			readonly supportOnly: readonly { readonly id: string }[];
			readonly retired: readonly { readonly id: string }[];
		}>("cases");
		const classes = [cases.canonical, cases.supportOnly, cases.retired];
		const allIds = classes.flatMap((entries) => entries.map(({ id }) => id));
		expect(new Set(allIds).size).toBe(allIds.length);
	});

	it("RPC-EVIDENCE-013 exactly registers all 343 active propositions and 48 retirements", () => {
		const result = audit(
			"ledger",
			"--legacy-preserve",
			"153",
			"--legacy-retire",
			"48",
			"--active",
			"343",
		);
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-014 resolves every node reference exactly once across disjoint classes", () => {
		const result = audit("graph", "--all-nodes-resolve");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-015 keeps every cases, covers, evidence, and supports array duplicate-free", () => {
		const result = audit("graph", "--duplicate-free");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-011 proves zero unfinished production verification Cases", () => {
		for (const command of ["ledger", "graph"] as const) {
			const result = audit(command, "--zero-incomplete");
			expect(result.stderr).toBe("");
			expect(result.status).toBe(0);
			expect(result.stdout).toContain(
				`${command} audit passed: active=343 retired=48 canonical=686 evidence=347`,
			);
		}
	});
});
