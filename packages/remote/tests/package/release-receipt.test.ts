/**
 * @overview Hermetic release receipt integrity tests.
 * @author AEPKILL
 * @created 2026-08-25 04:13:00
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidenceRoot = resolve(packageRoot, "evidence");
const receiptPath = resolve(evidenceRoot, "release-receipt.jcs.json");

interface ExecutionResults {
	readonly commands: readonly { readonly id: string }[];
	readonly counters: Readonly<Record<string, number>>;
}

interface ReleaseReceipt {
	readonly artifact: {
		readonly authoritativeTgzSha256: string;
		readonly testedTgzSha256: string;
		readonly publishedTgzSha256: string;
		readonly published: boolean;
		readonly publishedDigestMeaning: string;
		readonly canonicalTree: readonly unknown[];
	};
	readonly workflow: {
		readonly publishInputSha256: string;
		readonly publishInputEqualsAuthoritative: boolean;
	};
	readonly registries: Readonly<Record<string, unknown>>;
	readonly results: ExecutionResults;
	readonly toolchain: {
		readonly nodeMinimum: string;
		readonly nodeReceipt: string;
		readonly pnpm: string;
		readonly playwright: string;
		readonly browserEngines: Readonly<Record<string, string>>;
	};
}

function sha256(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
	if (typeof value === "object" && value !== null) {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right, "en"))
			.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

describe("RPC hermetic release receipt", () => {
	it("RPC-RELEASE-020 RPC-RELEASE-023 RPC-RELEASE-025 binds the final local artifact and registries", () => {
		const receiptText = readFileSync(receiptPath, "utf8");
		const receipt = JSON.parse(receiptText) as ReleaseReceipt;
		expect(receiptText).toBe(`${canonicalize(receipt)}\n`);

		const artifactSha256 = receipt.artifact.authoritativeTgzSha256;
		expect(artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
		expect(receipt.artifact).toMatchObject({
			testedTgzSha256: artifactSha256,
			publishedTgzSha256: artifactSha256,
			published: false,
		});
		expect(receipt.workflow).toMatchObject({
			publishInputSha256: artifactSha256,
			publishInputEqualsAuthoritative: true,
		});
		expect(receipt.artifact.publishedDigestMeaning).toContain(
			"workflow publish-input binding only",
		);

		const allowlist = JSON.parse(
			readFileSync(resolve(packageRoot, "release/tar-allowlist.json"), "utf8"),
		) as { readonly entries: readonly unknown[] };
		expect(receipt.artifact.canonicalTree).toEqual(allowlist.entries);
		expect(receipt.artifact.canonicalTree).toHaveLength(471);

		for (const name of ["requirements", "cases", "evidence", "matrix"]) {
			const path = resolve(evidenceRoot, `${name}.json`);
			const contents = readFileSync(path);
			expect(receipt.registries[`${name}Sha256`]).toBe(sha256(contents));
			expect(receipt.registries[name]).toEqual(JSON.parse(contents.toString()));
		}
	});

	it("RPC-RELEASE-021 RPC-RELEASE-024 records exact executed lanes and zero incomplete results", () => {
		const receipt = JSON.parse(
			readFileSync(receiptPath, "utf8"),
		) as ReleaseReceipt;
		const executionResults = JSON.parse(
			readFileSync(resolve(evidenceRoot, "execution-results.json"), "utf8"),
		) as ExecutionResults;
		expect(receipt.results).toEqual(executionResults);
		expect(receipt.toolchain).toMatchObject({
			nodeMinimum: "v23.6.0",
			nodeReceipt: "v23.6.0",
			pnpm: "11.13.1",
			playwright: "1.62.1",
		});
		expect(Object.keys(receipt.toolchain.browserEngines).sort()).toEqual([
			"chromium",
			"firefox",
			"webkit",
		]);
		expect(executionResults.commands.map(({ id }) => id)).toEqual([
			"installed-node",
			"browser",
			"pack",
			"corpus",
		]);
		expect(executionResults.counters).toEqual({
			browser: 3,
			consumer: 11,
			conformance: 54,
			failed: 0,
			flaky: 0,
			missing: 0,
			only: 0,
			partial: 0,
			planned: 0,
			skipped: 0,
			todo: 0,
		});
	});
});
