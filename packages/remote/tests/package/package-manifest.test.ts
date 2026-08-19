/**
 * @overview Packed-package manifest and release-document contract tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const workspaceRoot = resolve(packageRoot, "../..");
const manifest = JSON.parse(
	readFileSync(resolve(packageRoot, "package.json"), "utf8"),
) as Record<string, unknown>;

describe("RPC package release contract", () => {
	it("RPC-PKG-005 RPC-PKG-006 declares a bounded portable publish artifact", () => {
		expect(manifest).toMatchObject({
			type: "module",
			sideEffects: false,
			engines: { node: ">=23.6" },
			publishConfig: { access: "public" },
			files: ["dist", "wire", "docs", "README.md", "CHANGELOG.md", "LICENSE"],
		});
		expect(Object.keys(manifest.dependencies as object).sort()).toEqual([
			"@husky-di/core",
			"rxjs",
		]);
	});

	it("RPC-PKG-006 RPC-RELEASE-004 includes the normative and user documentation", () => {
		for (const path of [
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"docs/SPECIFICATION.md",
			"docs/REQUIREMENTS.md",
			"docs/PROTOCOL.md",
			"docs/TRANSPORT.md",
		]) {
			expect(existsSync(resolve(packageRoot, path)), path).toBe(true);
		}
		expect(readFileSync(resolve(packageRoot, "README.md"), "utf8")).toContain(
			"@husky-di/remote",
		);
		expect(
			readFileSync(resolve(packageRoot, "CHANGELOG.md"), "utf8"),
		).toContain("1.0.0");
		expect(readFileSync(resolve(packageRoot, "LICENSE"), "utf8")).toContain(
			"MIT License",
		);
	});

	it("RPC-RELEASE-004 carries the major Changeset for the first stable release", () => {
		const changesets = readdirSync(resolve(workspaceRoot, ".changeset"))
			.filter((name) => name.endsWith(".md") && name !== "README.md")
			.map((name) =>
				readFileSync(resolve(workspaceRoot, ".changeset", name), "utf8"),
			);
		expect(
			changesets.some((contents) =>
				contents.includes('"@husky-di/remote": major'),
			),
		).toBe(true);
	});

	it("RPC-RELEASE-002 RPC-RELEASE-004 installs the locked browser engines before CI and release tests", () => {
		const installCommand =
			"pnpm --filter @husky-di/remote exec playwright install --with-deps chromium firefox webkit";
		for (const workflowPath of [
			".github/workflows/ci.yml",
			".github/workflows/release.yml",
		]) {
			const workflow = readFileSync(
				resolve(workspaceRoot, workflowPath),
				"utf8",
			);
			expect(workflow, workflowPath).toContain(installCommand);
			expect(workflow.indexOf(installCommand), workflowPath).toBeGreaterThan(
				workflow.indexOf("pnpm install --frozen-lockfile"),
			);
			expect(workflow.indexOf("run: pnpm test"), workflowPath).toBeGreaterThan(
				workflow.indexOf(installCommand),
			);
		}
	});
});
