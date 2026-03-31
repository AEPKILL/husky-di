/**
 * File placement validator.
 *
 * @overview
 * Validates that files are placed in correct directories according to
 * repository code standard conventions.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import type * as ts from "typescript";
import {
	ALLOWED_SOURCE_DIRECTORY_NAMES,
	REQUIRED_SUFFIX_BY_SOURCE_DIRECTORY,
} from "../../constants/file-placement.const.js";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum.js";
import type { ICodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.interface.js";
import { createDiagnostic } from "../create-diagnostic.utils.js";

export function validateFilePlacement(
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
				CodeStandardRuleIdEnum.NamingFileName,
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
				CodeStandardRuleIdEnum.PlacementSourceDirectory,
				relativeFilePath,
				sourceFile,
				0,
				"Package source files must live in an existing semantic directory or be src/index.ts.",
			),
		];
	}

	const sourceDirectoryName = pathSegments[3];
	if (!ALLOWED_SOURCE_DIRECTORY_NAMES.has(sourceDirectoryName)) {
		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.PlacementSourceDirectory,
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
				CodeStandardRuleIdEnum.NamingFileName,
				relativeFilePath,
				sourceFile,
				0,
				"Implementation files must use PascalCase.ts under src/impls.",
			),
		];
	}

	const requiredSuffix =
		REQUIRED_SUFFIX_BY_SOURCE_DIRECTORY.get(sourceDirectoryName);
	if (requiredSuffix && !fileName.endsWith(requiredSuffix)) {
		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.NamingFileName,
				relativeFilePath,
				sourceFile,
				0,
				`Files in src/${sourceDirectoryName} must end with ${requiredSuffix}.`,
			),
		];
	}

	return [];
}

function isPascalCaseTypeScriptFile(fileName: string): boolean {
	if (!fileName.endsWith(".ts") || fileName.endsWith(".d.ts")) {
		return false;
	}

	const baseName = fileName.slice(0, -3);
	if (baseName.length === 0) {
		return false;
	}

	if (baseName[0] !== baseName[0].toUpperCase()) {
		return false;
	}

	return /^[A-Za-z0-9]+$/.test(baseName);
}
