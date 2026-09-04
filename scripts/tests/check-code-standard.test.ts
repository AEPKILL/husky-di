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
import { createConfig } from "../src/config/code-standard.config.js";
import { validateCodeStandard } from "../src/utils/validate-code-standard.util.js";

const ZOD_TYPE_DECLARATIONS = `
export interface ZodType {
	readonly _zod: object;
	readonly(): ZodType;
	email(): ZodType;
	int(): ZodType;
	optional(): ZodType;
	parse(value: unknown): unknown;
	pick(mask: object): ZodType;
}

export interface ZodCheck {
	readonly _zod: object;
}

export declare namespace z {
	type input<TSchema extends ZodType> = unknown;
	function fromJSONSchema(value: unknown): ZodType;
	function lt(value: number): ZodCheck;
	function number(): ZodType;
	function optional(schema: ZodType): ZodType;
	function strictObject(shape: object): ZodType;
	function string(): ZodType;
	namespace coerce {
		function number(): ZodType;
	}
	namespace iso {
		function datetime(): ZodType;
	}
}

export declare function fromJSONSchema(value: unknown): ZodType;
export declare function toJSONSchema(schema: ZodType): unknown;
`;

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
	if (Object.values(files).some((sourceText) => sourceText.includes('"zod"'))) {
		const zodRootPath = join(rootDirectoryPath, "node_modules/zod");
		mkdirSync(zodRootPath, { recursive: true });
		writeFileSync(join(zodRootPath, "index.d.ts"), ZOD_TYPE_DECLARATIONS);
		writeFileSync(
			join(zodRootPath, "package.json"),
			JSON.stringify({ name: "zod", types: "index.d.ts" }),
		);
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

	it("allows Vitest type test files under package tests", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/tests/container.test-d.ts": `/**
 * @overview Container type tests.
 * @author AEPKILL
 * @created 2026-08-26 15:05:00
 */
import { expectTypeOf, test } from "vitest";

test("resolves service types", () => {
	expectTypeOf<string>().toEqualTypeOf<string>();
});
`,
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

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"naming/interface-file-name",
			"placement/source-directory-suffix",
		]);
	});

	it("reports invalid impl file names", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/module/src/impls/Module.ts": `/**
 * @overview Module implementation.
 * @author AEPKILL
 * @created 2025-08-09 15:56:11
 */
export class ModuleImpl {}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"placement/source-directory-suffix",
		]);
	});

	it("reports default exports in source and test files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/value.util.ts": `/**
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
import { ContainerImpl } from "./impls/container.impl";

export const rootContainer: IContainer = ContainerImpl.rootContainer;
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
			"packages/module/src/utils/value.util.ts": `/**
 * @overview Module utility.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { ContainerImpl } from "@husky-di/core/src/impls/container.impl";

export function getContainerName(): string {
	return ContainerImpl.name;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"imports/no-internal-package-path",
		]);
	});

	it("allows cross-package imports from exported subpath entrypoints", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/package.json": JSON.stringify({
				name: "@husky-di/core",
				exports: {
					".": "./dist/index.js",
					"./testing": "./dist/testing.js",
				},
			}),
			"packages/module/src/utils/value.util.ts": `/**
 * @overview Module utility.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { createFixture } from "@husky-di/core/testing";

export function getFixture(): unknown {
	return createFixture();
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports biome-ignore directives without reasons", () => {
		const rootDirectoryPath = createWorkspace({
			"scripts/src/check-code-standard.ts": `/**
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

	it("reports enums without Enum suffix", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/enums/status.enum.ts": `/**
 * @overview Status enum.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export enum Status {
	Active = 0,
	Inactive = 1,
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["naming/enum-name"]);
	});

	it("allows enums with Enum suffix", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/enums/status.enum.ts": `/**
 * @overview Status enum.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export enum StatusEnum {
	Active = 0,
	Inactive = 1,
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports constants without SCREAMING_SNAKE_CASE in .const.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/constants/error-codes.const.ts": `/**
 * @overview Error codes constant.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const errorCodes = {
	NOT_FOUND: "NOT_FOUND",
} as const;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["naming/constant-name"]);
	});

	it("allows constants with SCREAMING_SNAKE_CASE in .const.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/constants/error-codes.const.ts": `/**
 * @overview Error codes constant.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const ERROR_CODES = {
	NOT_FOUND: "NOT_FOUND",
} as const;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("ignores constants in non-.const.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/value.util.ts": `/**
 * @overview Value utility.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const valueName = "test";
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports interfaces without I prefix in interfaces/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/interfaces/container.interface.ts": `/**
 * @overview Container interface.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export interface Container {
	name: string;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["naming/interface-name"]);
	});

	it("reports interface files without .interface.ts suffix", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/interfaces/container.ts": `/**
 * @overview Container interface.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export interface IContainer {
	name: string;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"naming/interface-file-name",
			"placement/source-directory-suffix",
		]);
	});

	it("allows interfaces with I prefix and .interface.ts suffix", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/interfaces/container.interface.ts": `/**
 * @overview Container interface.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export interface IContainer {
	name: string;
}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports .type.ts files outside types/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/value.type.ts": `/**
 * @overview Value type.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type ValueType = string | number;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"placement/source-directory-suffix",
		]);
	});

	it("allows type aliases in non-type files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/value.util.ts": `/**
 * @overview Value utility.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type ValueType = string | number;
export const createValue = (): string => "value";
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("allows type aliases in types/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/value.type.ts": `/**
 * @overview Value type.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type ValueType = string | number;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("allows type aliases in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/value.type.ts": `/**
 * @overview Value type.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type ValueType = string | number;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("allows direct and composed Zod schemas in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/options.type.ts": `/**
 * @overview Schema-derived option types.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { fromJSONSchema, z } from "zod";
import { identifierSchema } from "../utils/identifier.util.js";

export type Options = z.input<typeof optionsSchema>;

export const optionalIdentifierSchema = identifierSchema.optional();
export const optionalEmailSchema = z.optional(z.string().email());
export const coercedNumberSchema = z.coerce.number().int();
export const isoDateTimeSchema = z.iso.datetime();
export const jsonSchema = fromJSONSchema({});
export const optionsSchema = z
	.strictObject({ identifier: optionalIdentifierSchema })
	.readonly();
export const selectedOptionsSchema = optionsSchema.pick({ identifier: true });
`,
			"packages/core/src/utils/identifier.util.ts": `/**
 * @overview Identifier schema.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { z } from "zod";

export const identifierSchema = z.string();
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports runtime values in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/invalid.type.ts": `/**
 * @overview Invalid type file.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type ValueType = string | number;
export const value = 42;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), ["type-file/exports-only"]);
	});

	it("reports schema-looking constants that do not construct schemas", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/invalid.type.ts": `/**
 * @overview Invalid schema declarations.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { z } from "zod";
import { z as unrelatedZ } from "not-zod";
import { value as importedSchema } from "../utils/value.util.js";

export const objectSchema = {};
export const parsedSchema = z.string().parse("value");
export const checkSchema = z.lt(1);
export const zodValue = z.string();
let mutableSchema = z.number();
export const unrelatedSchema = unrelatedZ.string();
export const copiedSchema = importedSchema;
`,
			"packages/core/src/utils/value.util.ts": `/**
 * @overview Plain runtime value.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const value = 1;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
		]);
	});

	it("continues to reject functions and classes in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/invalid.type.ts": `/**
 * @overview Invalid runtime declarations.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { z } from "zod";

export function createValueSchema() {
	return z.string();
}

export class ValueSchema {}
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"type-file/exports-only",
			"type-file/exports-only",
		]);
	});

	it("allows only type and schema runtime re-exports in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/value.type.ts": `/**
 * @overview Schema re-export boundary.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export type { Value } from "../utils/value.util.js";
export { valueSchema } from "../utils/value.util.js";
export { valueSchema as exportedSchema } from "../utils/value.util.js";
export { value } from "../utils/value.util.js";
export { value as valueAliasSchema } from "../utils/value.util.js";
export { valueSchema as valueAlias } from "../utils/value.util.js";
export * from "../utils/value.util.js";
`,
			"packages/core/src/utils/value.util.ts": `/**
 * @overview Values used by the schema re-export test.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { z } from "zod";

export type Value = string;

export const valueSchema = z.string();
export const value = "value";
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
		]);
	});

	it("rejects schema names whose static values are not Zod schemas", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/invalid.type.ts": `/**
 * @overview Schema provenance rejection cases.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
import { type ZodType, toJSONSchema, z } from "zod";
import { helperSchema } from "../utils/helper.util.js";

export const fakeSchema = toJSONSchema;
export const copiedSchema = helperSchema;
export const maybeSchema = Math.random() > 0.5
	? z.string()
	: { _zod: {}, parse: (_value: unknown) => 1 };
export const pickedSchema = {} as Pick<ZodType, "_zod" | "parse">;
export { toJSONSchema as exportedSchema } from "zod";
export { helperSchema as forwardedSchema } from "../utils/helper.util.js";
`,
			"packages/core/src/utils/helper.util.ts": `/**
 * @overview Non-schema helper with a schema-looking name.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const helperSchema = (): string => "value";
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
			"type-file/exports-only",
		]);
	});

	it("allows interfaces in .type.ts files", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/value.type.ts": `/**
 * @overview Value type.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export interface IValue {
	name: string;
}
export type ValueType = string | number;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), []);
	});

	it("reports non-.type.ts files in types/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/types/invalid.ts": `/**
 * @overview Invalid file.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const value = 42;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"placement/source-directory-suffix",
		]);
	});

	it("reports non-.interface.ts files in interfaces/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/interfaces/invalid.ts": `/**
 * @overview Invalid file.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const value = 42;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"naming/interface-file-name",
			"placement/source-directory-suffix",
		]);
	});

	it("reports non-.util.ts files in utils/ directory", () => {
		const rootDirectoryPath = createWorkspace({
			"packages/core/src/utils/invalid.ts": `/**
 * @overview Invalid file.
 * @author AEPKILL
 * @created 2025-08-09 14:55:21
 */
export const value = 42;
`,
		});

		assert.deepEqual(getRuleIds(rootDirectoryPath), [
			"placement/source-directory-suffix",
		]);
	});
});

describe("createConfig", () => {
	it("creates a valid config with default values", () => {
		const config = createConfig({});
		assert.ok(config.sourceDirectoryNames.length > 0);
		assert.ok(config.requiredSuffixBySourceDirectoryName.size > 0);
	});

	it("throws when suffix config key is not in sourceDirectoryNames", () => {
		assert.throws(
			() =>
				createConfig({
					requiredSuffixBySourceDirectoryName: new Map([
						["invalid_dir", [".ts"]],
					]),
				}),
			/which is not in sourceDirectoryNames/,
		);
	});

	it("throws when suffix pattern array is empty", () => {
		assert.throws(
			() =>
				createConfig({
					requiredSuffixBySourceDirectoryName: new Map([["utils", []]]),
				}),
			/must have at least one suffix pattern/,
		);
	});

	it("throws when suffix pattern is an empty string", () => {
		assert.throws(
			() =>
				createConfig({
					requiredSuffixBySourceDirectoryName: new Map([["utils", [""]]]),
				}),
			/is an empty string/,
		);
	});

	it("accepts RegExp patterns", () => {
		const config = createConfig({
			requiredSuffixBySourceDirectoryName: new Map([
				["utils", [/^\.util\.ts$/]],
			]),
		});
		const patterns = config.requiredSuffixBySourceDirectoryName.get("utils");
		assert.ok(patterns?.[0] instanceof RegExp);
	});

	it("accepts valid config with multiple suffix patterns", () => {
		const config = createConfig({
			requiredSuffixBySourceDirectoryName: new Map([
				["types", [".type.ts", ".d.ts"]],
			]),
		});
		assert.deepEqual(config.requiredSuffixBySourceDirectoryName.get("types"), [
			".type.ts",
			".d.ts",
		]);
	});
});
