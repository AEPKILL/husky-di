/**
 * Type file exports validator.
 *
 * @overview
 * Validates that .type.ts files only contain type-only exports.
 * Prevents runtime values from being exported in type files.
 *
 * @author AEPKILL
 * @created 2026-03-31 16:15:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";
import { extractFileName } from "@/utils/path.utils";

const ALLOWED_STATEMENTS = new Set([
	ts.SyntaxKind.TypeAliasDeclaration,
	ts.SyntaxKind.InterfaceDeclaration,
	ts.SyntaxKind.ImportDeclaration,
	ts.SyntaxKind.ExportDeclaration,
]);

const STATEMENT_ERROR_MESSAGES: Record<number, string> = {
	[ts.SyntaxKind.EnumDeclaration]:
		".type.ts files may only contain type aliases, interfaces, and type-only exports. Enum declarations are not allowed.",
	[ts.SyntaxKind.VariableStatement]:
		".type.ts files may only contain type aliases, interfaces, and type-only exports. Runtime values are not allowed.",
	[ts.SyntaxKind.FunctionDeclaration]:
		".type.ts files may only contain type aliases, interfaces, and type-only exports. Function declarations are not allowed.",
	[ts.SyntaxKind.ClassDeclaration]:
		".type.ts files may only contain type aliases, interfaces, and type-only exports. Class declarations are not allowed.",
};

export function validateTypeFileExports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	const fileName = extractFileName(relativeFilePath);
	if (!fileName.endsWith(".type.ts")) {
		return diagnostics;
	}

	for (const statement of sourceFile.statements) {
		if (ALLOWED_STATEMENTS.has(statement.kind)) {
			continue;
		}

		const errorMessage =
			STATEMENT_ERROR_MESSAGES[statement.kind] ??
			".type.ts files may only contain type aliases, interfaces, and type-only exports.";

		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.TypeFileExportsOnly,
				relativeFilePath,
				sourceFile,
				statement.getStart(sourceFile),
				errorMessage,
			),
		);
	}

	return diagnostics;
}
