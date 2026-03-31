/**
 * Type placement validator.
 *
 * @overview
 * Validates that .type.ts files are placed in the types/ directory.
 * Type files (.type.ts) outside types/ directory are not allowed.
 *
 * @author AEPKILL
 * @created 2026-03-31 11:45:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";
import { extractFileName, isInDirectory } from "@/utils/path.utils";

export function validateTypePlacement(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	const fileName = extractFileName(relativeFilePath);
	const isInTypesDirectory = isInDirectory(relativeFilePath, "types");
	const isTypeFile = fileName.endsWith(".type.ts");

	if (!isTypeFile) {
		return diagnostics;
	}

	if (isInTypesDirectory) {
		return diagnostics;
	}

	for (const statement of sourceFile.statements) {
		if (!ts.isTypeAliasDeclaration(statement)) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.PlacementType,
				relativeFilePath,
				sourceFile,
				statement.name.getStart(sourceFile),
				`.type.ts files must be placed in the types/ directory.`,
			),
		);
	}

	return diagnostics;
}
