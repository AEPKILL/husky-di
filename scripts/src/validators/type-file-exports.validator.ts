/**
 * Type file exports validator.
 *
 * @overview
 * Validates that .type.ts files contain type declarations and canonical schemas.
 * Prevents runtime values other than statically verified Zod schema constants.
 *
 * @author AEPKILL
 * @created 2026-03-31 16:15:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.util";
import { extractFileName } from "@/utils/path.util";

export function validateTypeFileExports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	typeChecker?: ts.TypeChecker,
	zodSchemaType?: ts.Type,
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
		if (
			ts.isExportDeclaration(statement) &&
			isTypeOrSchemaExportDeclaration(statement, typeChecker, zodSchemaType)
		) {
			continue;
		}
		if (
			ts.isVariableStatement(statement) &&
			isSchemaVariableStatement(statement, typeChecker, zodSchemaType)
		) {
			continue;
		}

		const errorMessage =
			STATEMENT_ERROR_MESSAGES[statement.kind] ??
			".type.ts files may only contain type aliases, interfaces, type-only exports, and Zod schema constants.";

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

const ALLOWED_STATEMENTS = new Set([
	ts.SyntaxKind.TypeAliasDeclaration,
	ts.SyntaxKind.InterfaceDeclaration,
	ts.SyntaxKind.ImportDeclaration,
]);

const STATEMENT_ERROR_MESSAGES: Record<number, string> = {
	[ts.SyntaxKind.EnumDeclaration]:
		".type.ts files may only contain type aliases, interfaces, type-only exports, and Zod schema constants. Enum declarations are not allowed.",
	[ts.SyntaxKind.VariableStatement]:
		"Runtime values in .type.ts files must be const Zod schemas with names ending in Schema.",
	[ts.SyntaxKind.FunctionDeclaration]:
		".type.ts files may only contain type aliases, interfaces, type-only exports, and Zod schema constants. Function declarations are not allowed.",
	[ts.SyntaxKind.ClassDeclaration]:
		".type.ts files may only contain type aliases, interfaces, type-only exports, and Zod schema constants. Class declarations are not allowed.",
};

function isTypeOrSchemaExportDeclaration(
	statement: ts.ExportDeclaration,
	typeChecker?: ts.TypeChecker,
	zodSchemaType?: ts.Type,
): boolean {
	if (statement.isTypeOnly) {
		return true;
	}
	const exportClause = statement.exportClause;
	if (!exportClause || !ts.isNamedExports(exportClause)) {
		return false;
	}
	return exportClause.elements.every((element) => {
		if (element.isTypeOnly) {
			return true;
		}
		const sourceName = element.propertyName?.text ?? element.name.text;
		return (
			sourceName.endsWith("Schema") &&
			element.name.text.endsWith("Schema") &&
			isZodSchemaNode(
				element.propertyName ?? element.name,
				typeChecker,
				zodSchemaType,
			)
		);
	});
}

function isSchemaVariableStatement(
	statement: ts.VariableStatement,
	typeChecker?: ts.TypeChecker,
	zodSchemaType?: ts.Type,
): boolean {
	if (
		(statement.declarationList.flags & ts.NodeFlags.Const) !==
		ts.NodeFlags.Const
	) {
		return false;
	}

	return statement.declarationList.declarations.every((declaration) => {
		return (
			ts.isIdentifier(declaration.name) &&
			declaration.name.text.endsWith("Schema") &&
			declaration.initializer !== undefined &&
			isZodSchemaNode(declaration.initializer, typeChecker, zodSchemaType)
		);
	});
}

function isZodSchemaNode(
	node: ts.Node,
	typeChecker?: ts.TypeChecker,
	zodSchemaType?: ts.Type,
): boolean {
	if (typeChecker === undefined || zodSchemaType === undefined) {
		return false;
	}
	const nodeType = typeChecker.getTypeAtLocation(node);
	if (
		(nodeType.flags &
			(ts.TypeFlags.Any | ts.TypeFlags.Never | ts.TypeFlags.Unknown)) !==
		0
	) {
		return false;
	}
	return typeChecker.isTypeAssignableTo(nodeType, zodSchemaType);
}
