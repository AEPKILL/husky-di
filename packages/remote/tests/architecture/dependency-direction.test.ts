/**
 * @overview Guards the Remote package's interface-first dependency direction.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = resolve(packageRoot, "src");

function listTypeScriptFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory()
			? listTypeScriptFiles(path)
			: entry.name.endsWith(".ts")
				? [path]
				: [];
	});
}

describe("Remote package dependency direction", () => {
	it("binds concrete implementations only in factories", () => {
		const violations = listTypeScriptFiles(sourceRoot)
			.filter((path) => !path.includes(`${sep}factories${sep}`))
			.filter((path) =>
				/(?:from\s+|import\s*\()["']@\/impls\//u.test(
					readFileSync(path, "utf8"),
				),
			)
			.map((path) => relative(packageRoot, path));

		expect(violations).toEqual([]);
	});
});
