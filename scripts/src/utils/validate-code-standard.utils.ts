/**
 * Code standard validator main entry.
 *
 * @overview
 * Main validation function that orchestrates all code standard checks.
 * Collects in-scope files and runs all validators against them.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { validateBiomeIgnoreComments } from "../validators/biome-ignore.validator";
import { validateConstantNaming } from "../validators/constant-naming.validator";
import { validateDefaultExports } from "../validators/default-exports.validator";
import { validateEntrypointShape } from "../validators/entrypoint-shape.validator";
import { validateEnumNaming } from "../validators/enum-naming.validator";
import { validateFilePlacement } from "../validators/file-placement.validator";
import { validateHeaderMetadata } from "../validators/header-metadata.validator";
import { validateImportSpecifiers } from "../validators/import-specifiers.validator";
import { validateInterfaceNaming } from "../validators/interface-naming.validator";
import { validateTypeFileExports } from "../validators/type-file-exports.validator";
import { collectInScopeFiles } from "./file-collector.utils";

export type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";

export function validateCodeStandard(
	rootDirectoryPath: string,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	for (const filePath of collectInScopeFiles(rootDirectoryPath, config)) {
		const sourceText = readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const relativeFilePath = toPortablePath(
			filePath.slice(rootDirectoryPath.length + 1),
		);

		diagnostics.push(
			...validateHeaderMetadata(relativeFilePath, sourceFile, sourceText),
		);
		diagnostics.push(
			...validateFilePlacement(relativeFilePath, sourceFile, config),
		);
		diagnostics.push(...validateEnumNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateConstantNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateInterfaceNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateTypeFileExports(relativeFilePath, sourceFile));
		diagnostics.push(...validateDefaultExports(relativeFilePath, sourceFile));
		diagnostics.push(...validateEntrypointShape(relativeFilePath, sourceFile));
		diagnostics.push(
			...validateImportSpecifiers(relativeFilePath, sourceFile, config),
		);
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

function toPortablePath(filePath: string): string {
	return filePath.split("\\").join("/");
}
