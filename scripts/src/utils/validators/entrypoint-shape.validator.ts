/**
 * Entrypoint shape validator.
 *
 * @overview
 * Validates that src/index.ts files only contain exports and stable forwarding.
 * Prevents implementation logic in entrypoint files.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { ICodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.interface";
import { createDiagnostic } from "../create-diagnostic.utils";

export function validateEntrypointShape(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	if (!relativeFilePath.endsWith("/src/index.ts")) {
		return [];
	}

	const importedBindingNames = getImportedBindingNames(sourceFile);

	for (const statement of sourceFile.statements) {
		if (
			ts.isImportDeclaration(statement) ||
			ts.isExportDeclaration(statement)
		) {
			continue;
		}

		if (
			ts.isVariableStatement(statement) &&
			hasExportModifier(statement) &&
			isStableForwardingVariableStatement(statement, importedBindingNames)
		) {
			continue;
		}

		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.EntrypointExportOnly,
				relativeFilePath,
				sourceFile,
				statement.getStart(sourceFile),
				"src/index.ts may only contain imports, export declarations, and stable constant forwarding.",
			),
		];
	}

	return [];
}

function getImportedBindingNames(sourceFile: ts.SourceFile): Set<string> {
	const importedBindingNames = new Set<string>();

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !statement.importClause) {
			continue;
		}

		const { name, namedBindings } = statement.importClause;
		if (name) {
			importedBindingNames.add(name.text);
		}

		if (namedBindings && ts.isNamespaceImport(namedBindings)) {
			importedBindingNames.add(namedBindings.name.text);
		}

		if (namedBindings && ts.isNamedImports(namedBindings)) {
			for (const element of namedBindings.elements) {
				importedBindingNames.add(element.name.text);
			}
		}
	}

	return importedBindingNames;
}

function hasExportModifier(statement: ts.Statement): boolean {
	if (!ts.canHaveModifiers(statement)) {
		return false;
	}

	const modifiers = ts.getModifiers(statement) ?? [];
	return modifiers.some(
		(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
	);
}

function isStableForwardingVariableStatement(
	statement: ts.VariableStatement,
	importedBindingNames: Set<string>,
): boolean {
	if (
		(statement.declarationList.flags & ts.NodeFlags.Const) !==
		ts.NodeFlags.Const
	) {
		return false;
	}

	return statement.declarationList.declarations.every((declaration) => {
		if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
			return false;
		}

		return isStableForwardingExpression(
			declaration.initializer,
			importedBindingNames,
		);
	});
}

function isStableForwardingExpression(
	expression: ts.Expression,
	importedBindingNames: Set<string>,
): boolean {
	if (ts.isIdentifier(expression)) {
		return importedBindingNames.has(expression.text);
	}

	if (
		ts.isPropertyAccessExpression(expression) ||
		ts.isAsExpression(expression) ||
		ts.isSatisfiesExpression(expression) ||
		ts.isNonNullExpression(expression) ||
		ts.isParenthesizedExpression(expression)
	) {
		return isStableForwardingExpression(
			expression.expression,
			importedBindingNames,
		);
	}

	return false;
}
