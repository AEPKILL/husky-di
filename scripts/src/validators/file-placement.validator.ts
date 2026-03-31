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
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";
import { extractFileName, getPathSegments } from "@/utils/path.utils";

export function validateFilePlacement(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): CodeStandardDiagnostic[] {
	const pathSegments = getPathSegments(relativeFilePath);
	const fileName = extractFileName(relativeFilePath);

	const sourceIndex = findFirstSegmentIndex(
		pathSegments,
		config.sourceDirectories,
	);

	if (sourceIndex === -1) {
		return [];
	}

	const packageArea = pathSegments[sourceIndex];
	if (packageArea === getTestsDirectoryName(config.sourceDirectories)) {
		if (fileName === "test.utils.ts" || fileName.endsWith(".test.ts")) {
			return [];
		}

		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.NamingFileName,
				relativeFilePath,
				sourceFile,
				0,
				`Files in package tests must be named *.test.ts or test.utils.ts.`,
			),
		];
	}

	if (pathSegments.length === sourceIndex + 2) {
		return [];
	}

	const sourceDirectoryName = pathSegments[sourceIndex + 1];
	if (!config.sourceDirectoryNames.includes(sourceDirectoryName)) {
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

	const allowedSuffixes = getRequiredSuffixes(
		sourceDirectoryName,
		config.requiredSuffixBySourceDirectoryName,
	);
	if (allowedSuffixes && !matchesFilePattern(fileName, allowedSuffixes)) {
		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.PlacementSourceDirectorySuffix,
				relativeFilePath,
				sourceFile,
				0,
				`${getSourceDirectoryName(config.sourceDirectories)}/${sourceDirectoryName} may only contain files with suffix ${formatSuffixList(allowedSuffixes)}.`,
			),
		];
	}

	return [];
}

function findFirstSegmentIndex(
	pathSegments: string[],
	targetNames: readonly string[],
): number {
	for (const targetName of targetNames) {
		const index = pathSegments.indexOf(targetName);
		if (index !== -1) {
			return index;
		}
	}
	return -1;
}

function getSourceDirectoryName(names: readonly string[]): string {
	return names[0] ?? "src";
}

function getTestsDirectoryName(names: readonly string[]): string | undefined {
	return (
		names.find((name) => name === "tests") ??
		names.find((name) => name !== "src")
	);
}

function getRequiredSuffixes(
	sourceDirectoryName: string,
	requiredSuffixBySourceDirectoryName: ReadonlyMap<
		string,
		readonly (string | RegExp)[]
	>,
): readonly (string | RegExp)[] | undefined {
	return requiredSuffixBySourceDirectoryName.get(sourceDirectoryName);
}

function matchesFilePattern(
	fileName: string,
	patterns: readonly (string | RegExp)[],
): boolean {
	for (const pattern of patterns) {
		if (pattern instanceof RegExp) {
			if (pattern.test(fileName)) {
				return true;
			}
		} else if (fileName.endsWith(pattern)) {
			return true;
		}
	}
	return false;
}

function formatSuffixList(patterns: readonly (string | RegExp)[]): string {
	return patterns
		.map((pattern) =>
			pattern instanceof RegExp ? pattern.toString() : pattern,
		)
		.join(" or ");
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
