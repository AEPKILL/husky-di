/**
 * @overview Code standard schema file specification compliance tests.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { validateCodeStandard } from "../src/utils/validate-code-standard.util.js";

const SOURCE_HEADER = `/**
 * @overview Schema file fixture.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */
`;

const ZOD_TYPE_DECLARATIONS = `
export interface ZodType {
	readonly _zod: object;
	readonly(): ZodType;
	parse(value: unknown): unknown;
}
export declare namespace z {
	type input<TSchema extends ZodType> = unknown;
	function string(): ZodType;
}
export declare function fromJSONSchema(value: unknown): ZodType;
`;

const temporaryDirectoryPaths: string[] = [];

afterEach(() => {
	for (const directoryPath of temporaryDirectoryPaths.splice(0)) {
		rmSync(directoryPath, { recursive: true, force: true });
	}
});

describe("Code standard schema file specification", () => {
	it("SCHEMA-001: checks suffixes in schema directories and other constrained roles", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/schemas/peer/value.type.ts":
				"export type Value = string;",
			"packages/remote/src/types/value.schema.ts":
				"export type Value = string;",
			"packages/remote/src/utils/value.schema.ts":
				"export type Value = string;",
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ filePath, ruleId }) => ({
				filePath,
				ruleId,
			})),
			[
				{
					filePath: "packages/remote/src/schemas/peer/value.type.ts",
					ruleId: "placement/source-directory-suffix",
				},
				{
					filePath: "packages/remote/src/types/value.schema.ts",
					ruleId: "placement/source-directory-suffix",
				},
				{
					filePath: "packages/remote/src/utils/value.schema.ts",
					ruleId: "placement/source-directory-suffix",
				},
			],
		);
	});

	it("SCHEMA-002: accepts typed schemas, derived types and named schema re-exports", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/schemas/peer/identifier.schema.ts": `
import { z } from "zod";
export type Identifier = z.input<typeof identifierSchema>;
export const identifierSchema = z.string().readonly();
`,
			"packages/remote/src/schemas/peer/options.schema.ts": `
import { identifierSchema } from "./identifier.schema.js";
export type { Identifier } from "./identifier.schema.js";
export { identifierSchema as wireNameSchema } from "./identifier.schema.js";
export const optionsSchema = identifierSchema.readonly();
`,
		});

		assert.deepEqual(validateCodeStandard(rootDirectoryPath), []);
	});

	it("SCHEMA-002: rejects non-schema values, mutable declarations and wrong names", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/schemas/invalid.schema.ts": `
import { z } from "zod";
export const value = z.string();
export const fakeSchema = {};
export const parsedSchema = z.string().parse("value");
export const unsafeSchema = {} as any;
export let mutableSchema = z.string();
`,
		});
		const diagnostics = validateCodeStandard(rootDirectoryPath);

		assert.deepEqual(
			diagnostics.map(({ ruleId }) => ruleId),
			Array(5).fill("schema-file/exports-only"),
		);
		assert.ok(
			diagnostics.every(({ message }) => message.includes(".schema.ts")),
		);
	});

	it("SCHEMA-002: rejects runtime functions and classes", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/schemas/invalid.schema.ts": `
import { z } from "zod";
export function createValueSchema() { return z.string(); }
export class ValueSchema {}
`,
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
			["schema-file/exports-only", "schema-file/exports-only"],
		);
	});

	it("SCHEMA-002: rejects non-schema, renamed and wildcard runtime re-exports", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/utils/value.util.ts": `
import { z } from "zod";
export const value = "value";
export const valueSchema = z.string();
`,
			"packages/remote/src/schemas/invalid.schema.ts": `
export { value as fakeSchema } from "../utils/value.util.js";
export { valueSchema as value } from "../utils/value.util.js";
export * from "../utils/value.util.js";
`,
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
			[
				"schema-file/exports-only",
				"schema-file/exports-only",
				"schema-file/exports-only",
			],
		);
	});

	it("SCHEMA-003: preserves schema colocation in type files", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/types/value.type.ts": `
import { z } from "zod";
export type Value = z.input<typeof valueSchema>;
export const valueSchema = z.string();
`,
		});

		assert.deepEqual(validateCodeStandard(rootDirectoryPath), []);
	});
});

function createSchemaWorkspace(files: Record<string, string>): string {
	const rootDirectoryPath = mkdtempSync(join(tmpdir(), "schema-standard-"));
	temporaryDirectoryPaths.push(rootDirectoryPath);
	const fixtureFiles = {
		"node_modules/zod/package.json": JSON.stringify({
			name: "zod",
			types: "index.d.ts",
		}),
		"node_modules/zod/index.d.ts": ZOD_TYPE_DECLARATIONS,
		...Object.fromEntries(
			Object.entries(files).map(([filePath, source]) => [
				filePath,
				SOURCE_HEADER + source,
			]),
		),
	};
	for (const [filePath, source] of Object.entries(fixtureFiles)) {
		const absoluteFilePath = join(rootDirectoryPath, filePath);
		mkdirSync(dirname(absoluteFilePath), { recursive: true });
		writeFileSync(absoluteFilePath, source);
	}
	return rootDirectoryPath;
}
