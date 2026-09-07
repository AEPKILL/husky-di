/**
 * @overview Code standard schema and module placement specification tests.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { collectInScopeFiles } from "../src/utils/file-collector.util.js";
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

describe("Code standard module placement specification", () => {
	it("MODULE-001: accepts module entrypoints and rejects implementation or other root files", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/modules/peer/index.ts":
				'export type { Descriptor } from "./types/descriptor.type";',
			"packages/remote/src/modules/peer/types/descriptor.type.ts":
				"export type Descriptor = string;",
			"packages/remote/src/modules/owner/index.ts":
				"export function createOwner() {}",
			"packages/remote/src/modules/peer/helper.ts": "export {};",
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
			["entrypoint/export-only", "placement/source-directory"],
		);
	});

	it("MODULE-002: accepts entrypoint imports and imports within the same module", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/modules/peer/index.ts":
				'export type { Descriptor } from "./types/descriptor.type";',
			"packages/remote/src/modules/peer/types/descriptor.type.ts":
				"export type Descriptor = string;",
			"packages/remote/src/modules/peer/types/local.type.ts":
				'import type { Descriptor } from "@/modules/peer/types/descriptor.type"; export type Local = Descriptor;',
			"packages/remote/tests/consumer.test.ts": `
import type { Descriptor } from "../src/modules/peer";
import type { Descriptor as Local } from "../src/modules/peer/index";
import "../src/modules/peer/index.ts";
export type { Descriptor as Alias } from "@/modules/peer/index.js";
export type PeerModule = typeof import("@/modules/peer");
void import("../src/modules/peer/index.js");
`,
		});

		assert.deepEqual(validateCodeStandard(rootDirectoryPath), []);
	});

	for (const source of [
		'import type { Descriptor } from "@/modules/peer/types/descriptor.type";',
		'export type { Descriptor } from "../src/modules/peer/types/descriptor.type";',
		'export type Descriptor = import("@/modules/peer/types/descriptor.type").Descriptor;',
		'void import("../src/modules/owner/../peer/types/descriptor.type");',
		'require("@/modules/peer/types/descriptor.type");',
		'import peer = require("../src/modules/peer/types/descriptor.type");',
	]) {
		it(`MODULE-002: rejects external deep references: ${source}`, () => {
			const rootDirectoryPath = createSchemaWorkspace({
				"packages/remote/tests/consumer.test.ts": source,
			});

			assert.deepEqual(
				validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
				["imports/no-internal-module-path"],
			);
		});
	}

	it("MODULE-002: does not confuse sibling module names or unconfigured packages", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/modules/peer-other/types/value.type.ts":
				'import type { Descriptor } from "@/modules/peer/types/descriptor.type";',
			"packages/core/src/types/value.type.ts":
				'import type { Value } from "@/modules/peer/types/value.type";',
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
			["imports/no-internal-module-path"],
		);
	});

	it("PLACEMENT-001: validates module roles and preserves root entrypoints", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/index.ts": "export {};",
			"packages/remote/src/shared/types/common.type.ts":
				"export type Value = string;",
			"packages/remote/src/modules/peer/types/descriptor.type.ts":
				"export type Descriptor = string;",
			"packages/remote/src/modules/peer/constants/descriptor.const.ts":
				'export const DESCRIPTOR = "descriptor";',
			"packages/remote/src/modules/protocol/schemas/identifier.schema.ts":
				'import { z } from "zod"; export const identifierSchema = z.string();',
		});

		assert.equal(collectInScopeFiles(rootDirectoryPath).length, 5);
		assert.deepEqual(validateCodeStandard(rootDirectoryPath), []);
	});

	it("PLACEMENT-001: reports invalid suffixes, declarations and unknown roles", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/modules/peer/misc/value.type.ts":
				"export type Value = string;",
			"packages/remote/src/modules/peer/types/value.schema.ts":
				"export type Value = string;",
			"packages/remote/src/modules/protocol/schemas/invalid.schema.ts":
				"export const fakeSchema = {};",
		});

		assert.deepEqual(
			validateCodeStandard(rootDirectoryPath).map(({ ruleId }) => ruleId),
			[
				"placement/source-directory",
				"placement/source-directory-suffix",
				"schema-file/exports-only",
			],
		);
	});

	it("PLACEMENT-001: retains collection rules outside configured roots", () => {
		const rootDirectoryPath = createSchemaWorkspace({
			"packages/remote/src/modules-other/peer/types/value.type.ts":
				"export type Value = string;",
			"packages/remote/src/peer/types/value.type.ts":
				"export type Value = string;",
			"packages/core/src/types/value.type.ts": "export type Value = string;",
			"packages/core/src/peer/types/value.type.ts":
				"export type Value = string;",
		});

		assert.deepEqual(collectInScopeFiles(rootDirectoryPath), [
			join(rootDirectoryPath, "packages/core/src/types/value.type.ts"),
		]);
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
