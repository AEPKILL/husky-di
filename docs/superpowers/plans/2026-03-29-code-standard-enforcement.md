# Code Standard Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-wide `husky-di-code-standard` gate using `Biome` plus a TypeScript AST validator, normalize the current baseline, and enforce the gate in `pre-commit` and CI.

**Architecture:** Keep `Biome` as the only formatter and general-purpose lint layer, and add a single repository-local validator at `scripts/check-code-standard.ts` for `husky-di`-specific hard rules. Unit test the validator with temporary workspaces under `scripts/tests`, then fix current repository violations before wiring the new gate into `.husky/pre-commit` and GitHub Actions.

**Tech Stack:** pnpm, Biome, TypeScript compiler API, tsx, node:test, Husky, GitHub Actions

---

## File Structure

- Create: `scripts/tsconfig.json`
- Create: `scripts/check-code-standard.ts`
- Create: `scripts/tests/check-code-standard.test.ts`
- Modify: `package.json`
- Modify: `biome.json`
- Modify: `.husky/pre-commit`
- Modify: `.github/workflows/ci.yml`
- Rename: `packages/module/src/impls/module.ts` -> `packages/module/src/impls/Module.ts`
- Modify: `packages/module/src/factories/module.factory.ts`
- Modify: `packages/module/tests/index.test.ts`
- Modify: `packages/decorator/tests/index.test.ts`
- Modify: `packages/core/tests/error-message.test.ts`
- Modify: `packages/core/tests/specification.test.ts`
- Modify: `packages/core/tests/simple.test.ts`
- Modify: `packages/core/tests/edge.test.ts`
- Modify: `packages/core/tests/ref.test.ts`
- Modify: `packages/core/tests/test.utils.ts`
- Modify: `packages/core/tests/cross-container.test.ts`
- Modify: `packages/core/src/interfaces/container.interface.ts`

### Task 1: Add the validator scaffold and root tooling

**Files:**
- Create: `scripts/tsconfig.json`
- Create: `scripts/check-code-standard.ts`
- Modify: `package.json`
- Modify: `biome.json`

- [ ] **Step 1: Install root dependencies for repository scripts**

Run: `pnpm add -D typescript tsx @types/node`
Expected: `package.json` and `pnpm-lock.yaml` include root development dependencies for TypeScript scripts and tests.

- [ ] **Step 2: Add root scripts for testing and running the validator**

Update `package.json` so the root scripts contain these exact entries:

```json
{
	"scripts": {
		"prepare": "husky",
		"build": "pnpm --filter @husky-di/* build",
		"test": "pnpm --filter @husky-di/* test",
		"test:code-standard": "pnpm exec tsx --test scripts/tests/check-code-standard.test.ts",
		"check:code-standard": "pnpm exec biome check packages scripts && pnpm exec tsx scripts/check-code-standard.ts",
		"changeset": "changeset",
		"changeset:version": "changeset version",
		"changeset:publish": "pnpm build && changeset publish",
		"changeset:snapshot": "pnpm build && changeset version --snapshot && changeset publish --tag snapshot",
		"release": "pnpm build && pnpm test && changeset publish"
	}
}
```

- [ ] **Step 3: Expand Biome's checked file set to include repository scripts**

Update `biome.json` so the `files.includes` section becomes:

```json
{
	"files": {
		"ignoreUnknown": false,
		"includes": ["packages/**/src/**", "packages/**/tests/**", "scripts/**/*.ts"]
	}
}
```

Keep the existing `style.useImportType` rule enabled so Biome continues to own the type-only import requirement for packages and the new `scripts/**/*.ts` scope.

- [ ] **Step 4: Add the scripts TypeScript project**

Create `scripts/tsconfig.json` with this content:

```json
{
	"compilerOptions": {
		"lib": ["ES2023"],
		"module": "ESNext",
		"target": "ES2022",
		"noEmit": true,
		"strict": true,
		"skipLibCheck": true,
		"moduleResolution": "bundler",
		"types": ["node"],
		"allowImportingTsExtensions": true
	},
	"include": ["."]
}
```

- [ ] **Step 5: Add the validator stub so tests can import it before TDD begins**

Create `scripts/check-code-standard.ts` with this content:

```ts
/**
 * @overview Repository code standard validator.
 * @author AEPKILL
 * @created 2026-03-29 21:35:00
 */

export interface ICodeStandardDiagnostic {
	readonly ruleId: string;
	readonly filePath: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

export function validateCodeStandard(
	_rootDirectoryPath: string,
): ICodeStandardDiagnostic[] {
	return [];
}
```

- [ ] **Step 6: Verify the scaffold type-checks**

Run: `pnpm exec tsc -p scripts/tsconfig.json --noEmit`
Expected: PASS with no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml biome.json scripts/tsconfig.json scripts/check-code-standard.ts docs/superpowers/plans/2026-03-29-code-standard-enforcement.md
git commit -m "chore: add code standard validator scaffold"
```

### Task 2: Implement and test the TypeScript validator

**Files:**
- Modify: `scripts/check-code-standard.ts`
- Create: `scripts/tests/check-code-standard.test.ts`

- [ ] **Step 1: Write the failing validator tests**

Create `scripts/tests/check-code-standard.test.ts` with this content:

```ts
/**
 * @overview Repository code standard validator tests.
 * @author AEPKILL
 * @created 2026-03-29 21:40:00
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

	it("reports implementation statements inside src/index.ts", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/index.ts": `/**
 * @overview Core package entrypoint.
 * @author AEPKILL
 * @created 2025-07-30 22:40:39
 */
export const value = 1;
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
```

- [ ] **Step 2: Run the tests to verify they fail for the current stub**

Run: `pnpm test:code-standard`
Expected: FAIL because `validateCodeStandard()` still returns an empty diagnostic list.

- [ ] **Step 3: Replace the stub with the real validator implementation**

Update `scripts/check-code-standard.ts` to this content:

```ts
/**
 * @overview Repository code standard validator.
 * @author AEPKILL
 * @created 2026-03-29 21:35:00
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

export interface ICodeStandardDiagnostic {
	readonly ruleId: string;
	readonly filePath: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

const ignoredDirectoryNames = new Set([
	".agents",
	".git",
	"coverage",
	"dist",
	"docs",
	"node_modules",
]);

const allowedSourceDirectoryNames = new Set([
	"constants",
	"decorators",
	"enums",
	"exceptions",
	"factories",
	"impls",
	"interfaces",
	"middlewares",
	"shared",
	"types",
	"typings",
	"utils",
]);

const requiredSuffixBySourceDirectory = new Map<string, string>([
	["constants", ".const.ts"],
	["decorators", ".decorator.ts"],
	["enums", ".enum.ts"],
	["exceptions", ".exception.ts"],
	["factories", ".factory.ts"],
	["interfaces", ".interface.ts"],
	["middlewares", ".middleware.ts"],
	["types", ".type.ts"],
	["typings", ".d.ts"],
	["utils", ".utils.ts"],
]);

export function validateCodeStandard(
	rootDirectoryPath: string,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const filePath of collectInScopeFiles(rootDirectoryPath)) {
		const sourceText = readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const relativeFilePath = toPortablePath(
			relative(rootDirectoryPath, filePath),
		);

		diagnostics.push(
			...validateHeaderMetadata(relativeFilePath, sourceFile, sourceText),
		);
		diagnostics.push(...validateFilePlacement(relativeFilePath, sourceFile));
		diagnostics.push(...validateDefaultExports(relativeFilePath, sourceFile));
		diagnostics.push(...validateEntrypointShape(relativeFilePath, sourceFile));
		diagnostics.push(...validateImportSpecifiers(relativeFilePath, sourceFile));
		diagnostics.push(
			...validateBiomeIgnoreComments(relativeFilePath, sourceFile, sourceText),
		);
	}

	return diagnostics.sort((left, right) => {
		return (
			left.filePath.localeCompare(right.filePath) ||
			left.line - right.line ||
			left.column - right.column ||
			left.ruleId.localeCompare(right.ruleId)
		);
	});
}

function collectInScopeFiles(rootDirectoryPath: string): string[] {
	const filePaths: string[] = [];

	const packagesDirectoryPath = join(rootDirectoryPath, "packages");
	if (existsSync(packagesDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(packagesDirectoryPath));
	}

	const scriptsDirectoryPath = join(rootDirectoryPath, "scripts");
	if (existsSync(scriptsDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(scriptsDirectoryPath));
	}

	return filePaths
		.filter((filePath) => isInScopeFile(rootDirectoryPath, filePath))
		.sort((left, right) => left.localeCompare(right));
}

function collectDirectoryFiles(directoryPath: string): string[] {
	const filePaths: string[] = [];

	for (const directoryEntry of readdirSync(directoryPath)) {
		if (ignoredDirectoryNames.has(directoryEntry)) {
			continue;
		}

		const entryPath = join(directoryPath, directoryEntry);
		if (statSync(entryPath).isDirectory()) {
			filePaths.push(...collectDirectoryFiles(entryPath));
			continue;
		}

		filePaths.push(entryPath);
	}

	return filePaths;
}

function isInScopeFile(rootDirectoryPath: string, filePath: string): boolean {
	const relativeFilePath = toPortablePath(relative(rootDirectoryPath, filePath));

	if (!relativeFilePath.endsWith(".ts")) {
		return false;
	}

	const pathSegments = relativeFilePath.split("/");
	if (pathSegments[0] === "scripts") {
		return true;
	}

	if (pathSegments[0] !== "packages" || pathSegments.length < 4) {
		return false;
	}

	return pathSegments[2] === "src" || pathSegments[2] === "tests";
}

function validateHeaderMetadata(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): ICodeStandardDiagnostic[] {
	const commentRanges = ts.getLeadingCommentRanges(sourceText, 0) ?? [];
	if (commentRanges.length === 0) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				0,
				"File header must include @overview, @author, and @created.",
			),
		];
	}

	const headerCommentRange = commentRanges[0];
	if (headerCommentRange.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				headerCommentRange.pos,
				"File header must be a block comment with @overview, @author, and @created.",
			),
		];
	}

	const headerCommentText = sourceText.slice(
		headerCommentRange.pos,
		headerCommentRange.end,
	);
	if (
		!headerCommentText.includes("@overview") ||
		!headerCommentText.includes("@author") ||
		!headerCommentText.includes("@created")
	) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				headerCommentRange.pos,
				"File header must include @overview, @author, and @created.",
			),
		];
	}

	return [];
}

function validateFilePlacement(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const pathSegments = relativeFilePath.split("/");
	const fileName = pathSegments[pathSegments.length - 1];

	if (pathSegments[0] === "scripts") {
		return [];
	}

	const packageArea = pathSegments[2];
	if (packageArea === "tests") {
		if (fileName === "test.utils.ts" || fileName.endsWith(".test.ts")) {
			return [];
		}

		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				"Files in package tests must be named *.test.ts or test.utils.ts.",
			),
		];
	}

	if (pathSegments.length === 4) {
		if (fileName === "index.ts") {
			return [];
		}

		return [
			createDiagnostic(
				"placement/source-directory",
				relativeFilePath,
				sourceFile,
				0,
				"Package source files must live in an existing semantic directory or be src/index.ts.",
			),
		];
	}

	const sourceDirectoryName = pathSegments[3];
	if (!allowedSourceDirectoryNames.has(sourceDirectoryName)) {
		return [
			createDiagnostic(
				"placement/source-directory",
				relativeFilePath,
				sourceFile,
				0,
				`Unknown source directory "${sourceDirectoryName}".`,
			),
		];
	}

	if (sourceDirectoryName === "impls") {
		if (isPascalCaseTypeScriptFile(fileName)) {
			return [];
		}

		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				"Implementation files must use PascalCase.ts under src/impls.",
			),
		];
	}

	const requiredSuffix = requiredSuffixBySourceDirectory.get(sourceDirectoryName);
	if (requiredSuffix && !fileName.endsWith(requiredSuffix)) {
		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				`Files in src/${sourceDirectoryName} must end with ${requiredSuffix}.`,
			),
		];
	}

	return [];
}

function validateDefaultExports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (ts.isExportAssignment(statement)) {
			diagnostics.push(
				createDiagnostic(
					"exports/no-default-export",
					relativeFilePath,
					sourceFile,
					statement.getStart(sourceFile),
					"Default exports are not allowed in the enforcement scope.",
				),
			);
			continue;
		}

		if (!ts.canHaveModifiers(statement)) {
			continue;
		}

		const modifiers = ts.getModifiers(statement) ?? [];
		const hasDefaultModifier = modifiers.some(
			(modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
		);
		if (hasDefaultModifier) {
			diagnostics.push(
				createDiagnostic(
					"exports/no-default-export",
					relativeFilePath,
					sourceFile,
					statement.getStart(sourceFile),
					"Default exports are not allowed in the enforcement scope.",
				),
			);
		}
	}

	return diagnostics;
}

function validateEntrypointShape(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	if (!relativeFilePath.endsWith("/src/index.ts")) {
		return [];
	}

	for (const statement of sourceFile.statements) {
		if (!ts.isExportDeclaration(statement)) {
			return [
				createDiagnostic(
					"entrypoint/export-only",
					relativeFilePath,
					sourceFile,
					statement.getStart(sourceFile),
					"src/index.ts must stay focused on export declarations.",
				),
			];
		}
	}

	return [];
}

function validateImportSpecifiers(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}

		const moduleSpecifierText = statement.moduleSpecifier.getText(sourceFile);
		const normalizedSpecifierText = moduleSpecifierText.slice(1, -1);
		if (!normalizedSpecifierText.startsWith("@husky-di/")) {
			continue;
		}

		const packagePathSegments = normalizedSpecifierText
			.slice("@husky-di/".length)
			.split("/");
		if (packagePathSegments.length > 1) {
			diagnostics.push(
				createDiagnostic(
					"imports/no-internal-package-path",
					relativeFilePath,
					sourceFile,
					statement.moduleSpecifier.getStart(sourceFile),
					"Cross-package imports must use the package root entrypoint, not internal source paths.",
				),
			);
		}
	}

	return diagnostics;
}

function validateBiomeIgnoreComments(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		sourceText,
	);

	let token = scanner.scan();
	while (token !== ts.SyntaxKind.EndOfFileToken) {
		if (
			token === ts.SyntaxKind.SingleLineCommentTrivia ||
			token === ts.SyntaxKind.MultiLineCommentTrivia
		) {
			const tokenText = trimCommentDelimiters(scanner.getTokenText()).trim();
			if (tokenText.startsWith("biome-ignore")) {
				const separatorIndex = tokenText.indexOf(":");
				const reasonText =
					separatorIndex >= 0 ? tokenText.slice(separatorIndex + 1).trim() : "";
				if (reasonText.length === 0) {
					diagnostics.push(
						createDiagnostic(
							"comments/biome-ignore-reason",
							relativeFilePath,
							sourceFile,
							scanner.getTokenPos(),
							"biome-ignore comments must include an explicit reason after ':'.",
						),
					);
				}
			}
		}

		token = scanner.scan();
	}

	return diagnostics;
}

function trimCommentDelimiters(commentText: string): string {
	if (commentText.startsWith("//")) {
		return commentText.slice(2);
	}

	if (commentText.startsWith("/*") && commentText.endsWith("*/")) {
		return commentText.slice(2, -2);
	}

	return commentText;
}

function isPascalCaseTypeScriptFile(fileName: string): boolean {
	if (!fileName.endsWith(".ts") || fileName.endsWith(".d.ts")) {
		return false;
	}

	const baseName = fileName.slice(0, -3);
	if (baseName.length === 0) {
		return false;
	}

	const firstCharacter = baseName[0];
	if (firstCharacter !== firstCharacter.toUpperCase()) {
		return false;
	}

	for (const character of baseName) {
		const isLetter = character.toLowerCase() !== character.toUpperCase();
		const isNumber = character >= "0" && character <= "9";
		if (!isLetter && !isNumber) {
			return false;
		}
	}

	return true;
}

function createDiagnostic(
	ruleId: string,
	filePath: string,
	sourceFile: ts.SourceFile,
	position: number,
	message: string,
): ICodeStandardDiagnostic {
	const location = sourceFile.getLineAndCharacterOfPosition(position);
	return {
		ruleId,
		filePath,
		line: location.line + 1,
		column: location.character + 1,
		message,
	};
}

function toPortablePath(filePath: string): string {
	return filePath.split(sep).join("/");
}

function runCli(): number {
	const diagnostics = validateCodeStandard(process.cwd());
	if (diagnostics.length === 0) {
		console.log("Code standard check passed.");
		return 0;
	}

	for (const diagnostic of diagnostics) {
		console.error(
			`[${diagnostic.ruleId}] ${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
		);
	}

	return 1;
}

const entryFilePath = process.argv[1];
if (entryFilePath && import.meta.url === pathToFileURL(entryFilePath).href) {
	process.exit(runCli());
}
```

- [ ] **Step 4: Run the validator tests to verify they pass**

Run: `pnpm test:code-standard`
Expected: PASS with all validator tests green.

- [ ] **Step 5: Verify the validator type-checks**

Run: `pnpm exec tsc -p scripts/tsconfig.json --noEmit`
Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-code-standard.ts scripts/tests/check-code-standard.test.ts docs/superpowers/plans/2026-03-29-code-standard-enforcement.md
git commit -m "feat: add code standard validator"
```

### Task 3: Normalize the current repository baseline

**Files:**
- Rename: `packages/module/src/impls/module.ts` -> `packages/module/src/impls/Module.ts`
- Modify: `packages/module/src/factories/module.factory.ts`
- Modify: `packages/module/tests/index.test.ts`
- Modify: `packages/decorator/tests/index.test.ts`
- Modify: `packages/core/tests/error-message.test.ts`
- Modify: `packages/core/tests/specification.test.ts`
- Modify: `packages/core/tests/simple.test.ts`
- Modify: `packages/core/tests/edge.test.ts`
- Modify: `packages/core/tests/ref.test.ts`
- Modify: `packages/core/tests/test.utils.ts`
- Modify: `packages/core/tests/cross-container.test.ts`
- Modify: `packages/core/src/interfaces/container.interface.ts`

- [ ] **Step 1: Run the new validator against the existing repository to confirm the baseline fails**

Run: `pnpm check:code-standard`
Expected: FAIL with diagnostics for the lowercase `module.ts`, missing test-file header metadata, missing `@created` in `packages/decorator/tests/index.test.ts`, and missing explicit `@overview` in `packages/core/src/interfaces/container.interface.ts`.

- [ ] **Step 2: Rename the module implementation file and update its import**

Run: `mv packages/module/src/impls/module.ts packages/module/src/impls/Module.ts`
Expected: The implementation file is renamed to match the `src/impls/PascalCase.ts` convention.

Update `packages/module/src/factories/module.factory.ts` so the import becomes:

```ts
import { Module } from "@/impls/Module";
```

- [ ] **Step 3: Add and normalize test-file headers**

Update the top of `packages/module/tests/index.test.ts` to:

```ts
/**
 * @overview Module package integration tests.
 * @author AEPKILL
 * @created 2025-08-06 21:39:35
 */

import { createServiceIdentifier, resolve } from "@husky-di/core";
import { describe, expect, it } from "vitest";
import { createModule } from "../src/index";
```

Update the top of `packages/decorator/tests/index.test.ts` to:

```ts
/**
 * @overview
 * Test suite for @husky-di/decorator based on SPECIFICATION.md
 * @author AEPKILL
 * @created 2025-08-06 21:39:35
 */
```

Update the top of `packages/core/tests/error-message.test.ts` to:

```ts
/**
 * @overview Core resolve error message tests.
 * @author AEPKILL
 * @created 2025-08-05 23:32:34
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

Update the top of `packages/core/tests/specification.test.ts` to:

```ts
/**
 * @overview Core specification compliance tests.
 *
 * This test suite validates that the container implementation complies with
 * the behavioral contract defined in SPECIFICATION.md v1.0.0.
 *
 * Each test is labeled with its corresponding specification requirement ID
 * (e.g., R1, S2, L1, etc.) for traceability.
 *
 * @author AEPKILL
 * @created 2025-11-28 17:39:24
 */
```

Update the top of `packages/core/tests/simple.test.ts` to:

```ts
/**
 * @overview Core container basic behavior tests.
 * @author AEPKILL
 * @created 2025-08-04 23:35:48
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

Update the top of `packages/core/tests/edge.test.ts` to:

```ts
/**
 * @overview Core edge case tests.
 * @author AEPKILL
 * @created 2023-05-27 10:12:16
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

Update the top of `packages/core/tests/ref.test.ts` to:

```ts
/**
 * @overview Core reference resolution tests.
 * @author AEPKILL
 * @created 2025-08-07 21:50:50
 */

import { describe, expect, it } from "vitest";
```

Update the top of `packages/core/tests/test.utils.ts` to:

```ts
/**
 * @overview Core test helper utilities.
 * @author AEPKILL
 * @created 2025-08-05 22:21:10
 */

import type { IContainer } from "../src/interfaces/container.interface";
```

Update the top of `packages/core/tests/cross-container.test.ts` to:

```ts
/**
 * @overview Core cross-container resolution tests.
 * @author AEPKILL
 * @created 2025-08-05 23:50:02
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
```

- [ ] **Step 4: Normalize the `container.interface.ts` file header**

Update the top of `packages/core/src/interfaces/container.interface.ts` to:

```ts
/**
 * @overview Container interface definitions and type utilities.
 *
 * @remarks
 * This module defines the core container interfaces following the
 * Interface Segregation Principle (ISP) from SOLID principles.
 * The main {@link IContainer} interface is composed of smaller,
 * focused interfaces that each handle a specific aspect of container
 * functionality.
 *
 * @author AEPKILL
 * @created 2025-06-25 23:27:49
 */
```

- [ ] **Step 5: Verify the baseline is clean**

Run: `pnpm test:code-standard && pnpm check:code-standard && pnpm test && pnpm build`
Expected: PASS. The validator tests, repository-wide code-standard gate, package tests, and package builds should all succeed.

- [ ] **Step 6: Commit**

```bash
git add packages/module/src/impls/Module.ts packages/module/src/factories/module.factory.ts packages/module/tests/index.test.ts packages/decorator/tests/index.test.ts packages/core/tests/error-message.test.ts packages/core/tests/specification.test.ts packages/core/tests/simple.test.ts packages/core/tests/edge.test.ts packages/core/tests/ref.test.ts packages/core/tests/test.utils.ts packages/core/tests/cross-container.test.ts packages/core/src/interfaces/container.interface.ts docs/superpowers/plans/2026-03-29-code-standard-enforcement.md
git commit -m "style: normalize code standard baseline"
```

### Task 4: Enable the blocking gate in pre-commit and CI

**Files:**
- Modify: `.husky/pre-commit`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update the Husky pre-commit hook to run the repository-wide gate**

Replace `.husky/pre-commit` with:

```sh
pnpm exec lint-staged
pnpm check:code-standard
```

- [ ] **Step 2: Add validator test and gate steps to CI**

Update `.github/workflows/ci.yml` so the job includes these steps after `Install dependencies`:

```yaml
      - name: Test code standard validator
        run: pnpm test:code-standard

      - name: Check code standard
        run: pnpm check:code-standard
```

Keep the existing package lint, package test, and package build steps.

- [ ] **Step 3: Verify the final gate setup**

Run: `pnpm test:code-standard && pnpm check:code-standard && pnpm test && pnpm build`
Expected: PASS locally with the same command set CI will enforce.

- [ ] **Step 4: Commit**

```bash
git add .husky/pre-commit .github/workflows/ci.yml docs/superpowers/plans/2026-03-29-code-standard-enforcement.md
git commit -m "ci: enforce code standard gate"
```
