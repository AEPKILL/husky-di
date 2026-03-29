/**
 * @overview Repository code standard validator tests.
 * @author AEPKILL
 * @created 2026-03-29 21:40:00
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { validateCodeStandard } from "../check-code-standard";

const temporaryDirectoryPaths: string[] = [];

afterEach(() => {
	while (temporaryDirectoryPaths.length > 0) {
		const directoryPath = temporaryDirectoryPaths.pop();
		if (directoryPath) {
			rmSync(directoryPath, { recursive: true, force: true });
		}
	}
});

function createWorkspace(files: Record<string, string>): string {
	const rootDirectoryPath = mkdtempSync(join(tmpdir(), "code-standard-"));
	temporaryDirectoryPaths.push(rootDirectoryPath);

	for (const [relativeFilePath, sourceText] of Object.entries(files)) {
		const filePath = join(rootDirectoryPath, relativeFilePath);
		mkdirSync(dirname(filePath), { recursive: true });
		writeFileSync(filePath, sourceText);
	}

	return rootDirectoryPath;
}

function getRuleIds(rootDirectoryPath: string): string[] {
	return validateCodeStandard(rootDirectoryPath).map(
		(diagnostic) => diagnostic.ruleId,
	);
}

describe("validateCodeStandard", () => {
	it("reports missing header metadata for in-scope files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/tests/simple.test.ts":
				'import { describe, it } from "vitest";\n',
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"headers/required-metadata",
		]);
	});

	it("ignores configuration files outside the enforcement scope", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/vitest.config.ts": "export default {};\n",
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports source files whose names do not match directory conventions", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/interfaces/container.ts": `/**
 * @overview Container interface.
 * @author AEPKILL
 * @created 2025-06-26 00:45:04
 */
export interface IContainer {}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["naming/file-name"]);
	});

	it("reports invalid impl file names", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/module/src/impls/module.ts": `/**
 * @overview Module implementation.
 * @author AEPKILL
 * @created 2025-08-09 15:56:11
 */
export class Module {}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["naming/file-name"]);
	});

	it("reports default exports in source and test files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/value.utils.ts": `/**
 * @overview Value utility.
 * @author AEPKILL
 * @created 2025-08-01 00:00:00
 */
export default function getValue(): number {
	return 1;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"exports/no-default-export",
		]);
	});

	it("allows stable constant forwarding inside src/index.ts", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/index.ts": `/**
 * @overview Core package entrypoint.
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */
import type { IContainer } from "@/interfaces/container.interface";
import { Container } from "./impls/Container";

export const rootContainer: IContainer = Container.rootContainer;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports implementation logic inside src/index.ts", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/index.ts": `/**
 * @overview Core package entrypoint.
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */
function createValue(): number {
	return 1;
}

export const value = createValue();
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["entrypoint/export-only"]);
	});

	it("reports cross-package internal imports", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/module/src/utils/value.utils.ts": `/**
 * @overview Module utility.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { Container } from "@husky-di/core/src/impls/Container";

export function getContainerName(): string {
	return Container.name;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"imports/no-internal-package-path",
		]);
	});

	it("reports biome-ignore directives without reasons", () => {
		const rootDirectoryPath = createWorkspace({
			"scripts/check-code-standard.ts": `/**
 * @overview Repository code standard validator.
 * @author AEPKILL
 * @created 2026-03-29 21:35:00
 */
// biome-ignore lint/style/noNonNullAssertion
export function run(): void {}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"comments/biome-ignore-reason",
		]);
	});
});
