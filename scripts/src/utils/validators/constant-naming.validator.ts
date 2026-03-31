/**
 * Constant naming validator.
 *
 * @overview
 * Validates that exported constant variables in .const.ts files follow the repository naming convention.
 * Exported constants must use SCREAMING_SNAKE_CASE naming.
 *
 * @author AEPKILL
 * @created 2026-03-30 21:09:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { ICodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.interface";
import { createDiagnostic } from "../create-diagnostic.utils";

const SCREAMING_SNAKE_CASE_REGEX = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export function validateConstantNaming(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	if (!relativeFilePath.endsWith(".const.ts")) {
		return diagnostics;
	}

	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) {
			continue;
		}

		const modifiers = ts.getModifiers(statement) ?? [];
		const hasExportModifier = modifiers.some(
			(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
		);

		if (!hasExportModifier) {
			continue;
		}

		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name)) {
				continue;
			}

			const variableName = declaration.name.text;
			if (!SCREAMING_SNAKE_CASE_REGEX.test(variableName)) {
				diagnostics.push(
					createDiagnostic(
						CodeStandardRuleIdEnum.NamingConstantName,
						relativeFilePath,
						sourceFile,
						declaration.name.getStart(sourceFile),
						`Exported constant "${variableName}" must use SCREAMING_SNAKE_CASE (e.g., "MODULE_ERROR_CODES").`,
					),
				);
			}
		}
	}

	return diagnostics;
}
