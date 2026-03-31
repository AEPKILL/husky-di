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
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.interface";
import { createDiagnostic } from "../create-diagnostic.utils";

export function validateImportSpecifiers(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

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
