/**
 * Import specifiers validator.
 *
 * @overview
 * Validates that cross-package imports use package root entrypoints.
 * Prevents direct imports from internal package source paths.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";

export function validateImportSpecifiers(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}

		const moduleSpecifierText = statement.moduleSpecifier.getText(sourceFile);
		const normalizedSpecifierText = moduleSpecifierText.slice(1, -1);
		if (!normalizedSpecifierText.startsWith(config.packageScopePrefix)) {
			continue;
		}

		const packagePathSegments = normalizedSpecifierText
			.slice(config.packageScopePrefix.length)
			.split("/");
		if (packagePathSegments.length <= 1) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.ImportsNoInternalPackagePath,
				relativeFilePath,
				sourceFile,
				statement.moduleSpecifier.getStart(sourceFile),
				"Cross-package imports must use the package root entrypoint, not internal source paths.",
			),
		);
	}

	return diagnostics;
}
