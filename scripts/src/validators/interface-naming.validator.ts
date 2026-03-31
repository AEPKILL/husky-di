/**
 * Interface naming validator.
 *
 * @overview
 * Validates that interfaces in interfaces/ directory follow repository naming conventions:
 * - Interface names must start with 'I' prefix
 * - Files must end with .interface.ts suffix
 *
 * @author AEPKILL
 * @created 2026-03-31 11:45:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";

export function validateInterfaceNaming(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	if (!relativeFilePath.includes("/interfaces/")) {
		return diagnostics;
	}

	const fileName = relativeFilePath.split("/").pop() ?? "";
	if (!fileName.endsWith(".interface.ts")) {
		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.NamingInterfaceFileName,
				relativeFilePath,
				sourceFile,
				0,
				"Interface files in interfaces/ directory must end with .interface.ts suffix.",
			),
		);
	}

	for (const statement of sourceFile.statements) {
		if (!ts.isInterfaceDeclaration(statement)) {
			continue;
		}

		const interfaceName = statement.name.text;
		if (!interfaceName.startsWith("I")) {
			diagnostics.push(
				createDiagnostic(
					CodeStandardRuleIdEnum.NamingInterfaceName,
					relativeFilePath,
					sourceFile,
					statement.name.getStart(sourceFile),
					`Interface "${interfaceName}" must start with 'I' prefix (e.g., "I${interfaceName}").`,
				),
			);
		}
	}

	return diagnostics;
}
