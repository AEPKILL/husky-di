/**
 * Import specifiers validator.
 *
 * @overview
 * Validates public cross-package imports and package dependency direction.
 * Prevents internal package paths and concrete imports outside assembly points.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { createDiagnostic } from "@/utils/create-diagnostic.util";

export function validateImportSpecifiers(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	config: CodeStandardConfig = DEFAULT_CONFIG,
	publicPackageImportSpecifiers: ReadonlySet<string> = new Set(),
): CodeStandardDiagnostic[] {
	const diagnostics = validateImplementationImportDirection(
		relativeFilePath,
		sourceFile,
	);

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
		if (publicPackageImportSpecifiers.has(normalizedSpecifierText)) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.ImportsNoInternalPackagePath,
				relativeFilePath,
				sourceFile,
				statement.moduleSpecifier.getStart(sourceFile),
				"Cross-package imports must use a public package entrypoint, not internal source paths.",
			),
		);
	}

	return diagnostics;
}

function validateImplementationImportDirection(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	if (
		!relativeFilePath.startsWith("packages/remote/src/") ||
		relativeFilePath.includes("/factories/")
	) {
		return [];
	}

	const diagnostics: CodeStandardDiagnostic[] = [];
	function visit(node: ts.Node): void {
		const moduleSpecifier = getModuleSpecifier(node);
		if (
			moduleSpecifier &&
			ts.isStringLiteralLike(moduleSpecifier) &&
			moduleSpecifier.text.startsWith("@/impls/")
		) {
			diagnostics.push(
				createDiagnostic(
					CodeStandardRuleIdEnum.ImportsImplementationOnlyInFactories,
					relativeFilePath,
					sourceFile,
					moduleSpecifier.getStart(sourceFile),
					"Concrete implementations may only be imported by factories.",
				),
			);
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return diagnostics;
}

function getModuleSpecifier(node: ts.Node): ts.Expression | undefined {
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
		return node.moduleSpecifier;
	}

	if (
		ts.isCallExpression(node) &&
		node.expression.kind === ts.SyntaxKind.ImportKeyword
	) {
		return node.arguments[0];
	}

	if (
		ts.isImportTypeNode(node) &&
		ts.isLiteralTypeNode(node.argument) &&
		ts.isStringLiteralLike(node.argument.literal)
	) {
		return node.argument.literal;
	}

	return undefined;
}
