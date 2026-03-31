/**
 * Default exports validator.
 *
 * @overview
 * Validates that no default exports are used in the enforcement scope.
 * Enforces named exports only according to repository standards.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { ICodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.interface";
import { createDiagnostic } from "../create-diagnostic.utils";

export function validateDefaultExports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		let hasDefaultExport = false;

		if (ts.isExportAssignment(statement)) {
			hasDefaultExport = true;
		} else if (ts.canHaveModifiers(statement)) {
			const modifiers = ts.getModifiers(statement) ?? [];
			hasDefaultExport = modifiers.some(
				(modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
			);
		}

		if (hasDefaultExport) {
			diagnostics.push(
				createDiagnostic(
					CodeStandardRuleIdEnum.ExportsNoDefaultExport,
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
