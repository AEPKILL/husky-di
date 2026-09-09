/**
 * @overview Package documentation, public entrypoint, and validation contract tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageManifest from "../../package.json";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("RPC package release contract", () => {
	it("RPC-PKG-006 RPC-RELEASE-004 includes the normative and user documentation", () => {
		expect(readFileSync(resolve(packageRoot, "README.md"), "utf8")).toContain(
			"@husky-di/remote",
		);
		expect(
			readFileSync(resolve(packageRoot, "CHANGELOG.md"), "utf8"),
		).toContain("Unreleased");
		expect(readFileSync(resolve(packageRoot, "LICENSE"), "utf8")).toContain(
			"MIT License",
		);
		for (const name of [
			"SPECIFICATION",
			"REQUIREMENTS",
			"PROTOCOL",
			"TRANSPORT",
		]) {
			expect(packageManifest.files).toContain(`docs/${name}.md`);
			expect(
				readFileSync(resolve(packageRoot, `docs/${name}.md`), "utf8").length,
			).toBeGreaterThan(0);
		}
	});

	it("RPC-RELEASE-002 RPC-RELEASE-004 includes browser and packed-consumer validation", () => {
		for (const script of [
			"typecheck",
			"test:types",
			"test:browser",
			"test:package",
		]) {
			expect(packageManifest.scripts.test).toContain(script);
		}
		const browserConfig = readFileSync(
			resolve(packageRoot, "playwright.config.ts"),
			"utf8",
		);
		for (const engine of ["chromium", "firefox", "webkit"]) {
			expect(browserConfig).toContain(`name: "${engine}"`);
		}
	});

	it("RPC-RELEASE-005 keeps independent Adapter implementations outside the core package", () => {
		expect(Object.keys(packageManifest.exports).sort()).toEqual([
			".",
			"./conformance",
			"./protocol",
			"./transport",
		]);
		expect(Object.keys(packageManifest.dependencies).sort()).toEqual([
			"@husky-di/core",
			"rxjs",
			"zod",
		]);
		expect(
			readFileSync(resolve(packageRoot, "docs/TRANSPORT.md"), "utf8"),
		).toContain("@husky-di/remote/conformance");
	});
});
