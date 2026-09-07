/**
 * @overview Enforces module entrypoints for imports from outside their owning module.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import { posix } from "node:path";
import * as ts from "typescript";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { createDiagnostic } from "@/utils/create-diagnostic.util";

export function validateModuleImports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	const visit = (node: ts.Node): void => {
		const specifier = readModuleSpecifier(node);
		if (specifier) {
			for (const root of config.moduleSourceRoots ?? []) {
				const segments = root.split("/");
				const sourceIndex = segments.findIndex((segment) =>
					config.sourceDirectories.includes(segment),
				);
				const sourceRoot = segments.slice(0, sourceIndex + 1).join("/");
				const packageRoot = segments.slice(0, sourceIndex).join("/");
				const target = specifier.text.startsWith(".")
					? posix.join(posix.dirname(relativeFilePath), specifier.text)
					: specifier.text.startsWith("@/") &&
							sourceIndex >= 0 &&
							relativeFilePath.startsWith(`${packageRoot}/`)
						? posix.join(sourceRoot, specifier.text.slice(2))
						: undefined;
				if (!target?.startsWith(`${root}/`)) continue;

				const [moduleName, ...internalPath] = target
					.slice(root.length + 1)
					.split("/");
				const moduleRoot = `${root}/${moduleName}`;
				const isSameModule = relativeFilePath.startsWith(`${moduleRoot}/`);
				const isEntrypoint =
					internalPath.length === 0 ||
					(internalPath.length === 1 &&
						/^index(?:\.[cm]?[jt]s)?$/.test(internalPath[0]));
				if (isSameModule || isEntrypoint) continue;

				diagnostics.push(
					createDiagnostic(
						CodeStandardRuleIdEnum.ImportsNoInternalModulePath,
						relativeFilePath,
						sourceFile,
						specifier.getStart(sourceFile),
						`Imports from outside module "${moduleName}" must use its index entrypoint.`,
					),
				);
				break;
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return diagnostics;
}

function readModuleSpecifier(node: ts.Node): ts.StringLiteralLike | undefined {
	let specifier: ts.Node | undefined;
	if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
		specifier = node.moduleSpecifier;
	} else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
		specifier = node.argument.literal;
	} else if (
		ts.isCallExpression(node) &&
		(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
			(ts.isIdentifier(node.expression) && node.expression.text === "require"))
	) {
		specifier = node.arguments[0];
	} else if (ts.isExternalModuleReference(node)) {
		specifier = node.expression;
	}
	return specifier && ts.isStringLiteralLike(specifier) ? specifier : undefined;
}
