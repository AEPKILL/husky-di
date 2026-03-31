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
import type { ICodeStandardDiagnostic } from "../interfaces/code-standard-diagnostic.interface";
import { collectInScopeFiles } from "./file-collector.utils";
import { validateBiomeIgnoreComments } from "./validators/biome-ignore.validator";
import { validateConstantNaming } from "./validators/constant-naming.validator";
import { validateDefaultExports } from "./validators/default-exports.validator";
import { validateEntrypointShape } from "./validators/entrypoint-shape.validator";
import { validateEnumNaming } from "./validators/enum-naming.validator";
import { validateFilePlacement } from "./validators/file-placement.validator";
import { validateHeaderMetadata } from "./validators/header-metadata.validator";
import { validateImportSpecifiers } from "./validators/import-specifiers.validator";

export type { ICodeStandardDiagnostic } from "../interfaces/code-standard-diagnostic.interface";

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
			filePath.slice(rootDirectoryPath.length + 1),
		);

		diagnostics.push(
			...validateHeaderMetadata(relativeFilePath, sourceFile, sourceText),
		);
		diagnostics.push(...validateFilePlacement(relativeFilePath, sourceFile));
		diagnostics.push(...validateEnumNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateConstantNaming(relativeFilePath, sourceFile));
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

function toPortablePath(filePath: string): string {
	return filePath.split("\\").join("/");
}
