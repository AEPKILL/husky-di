/**
 * Enum naming validator.
 *
 * @overview
 * Validates that enum declarations follow the repository naming convention.
 * All enums must end with the "Enum" suffix.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:54:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/interfaces/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";

export function validateEnumNaming(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isEnumDeclaration(statement)) {
			continue;
		}

		const enumName = statement.name.text;
		if (!enumName.endsWith("Enum")) {
			diagnostics.push(
				createDiagnostic(
					CodeStandardRuleIdEnum.NamingEnumName,
					relativeFilePath,
					sourceFile,
					statement.name.getStart(sourceFile),
					`Enum "${enumName}" must end with "Enum" suffix (e.g., "${enumName}Enum").`,
				),
			);
		}
	}

	return diagnostics;
}
