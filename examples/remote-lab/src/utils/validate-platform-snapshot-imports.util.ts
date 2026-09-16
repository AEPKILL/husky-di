/**
 * @overview Rejects statically identifiable local imports outside the saved project snapshot without evaluating developer modules.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import ts from "typescript";

export function validatePlatformSnapshotImports(
	rootPath: string,
	files: Record<string, string>,
): void {
	const configName = resolve(rootPath, "tsconfig.json");
	const configuration = files["tsconfig.json"];
	const config = configuration
		? ts.parseConfigFileTextToJson(configName, configuration).config
		: {};
	const host: ts.ModuleResolutionHost = {
		fileExists: (path) =>
			Object.hasOwn(files, relative(rootPath, path).split(sep).join("/")) ||
			ts.sys.fileExists(path),
		readFile: (path) =>
			files[relative(rootPath, path).split(sep).join("/")] ??
			ts.sys.readFile(path),
	};
	const options = ts.parseJsonConfigFileContent(
		config ?? {},
		ts.sys,
		rootPath,
	).options;
	for (const [path, source] of Object.entries(files)) {
		if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
		const filename = resolve(rootPath, path);
		const module = ts.createSourceFile(
			filename,
			source,
			ts.ScriptTarget.Latest,
			true,
		);
		const check = (specifier: string, typeOnly = false) => {
			if (specifier === "@husky-di/example-remote-lab/sdk") {
				// This package subpath exports declarations only; its implementation location is never loaded into the run.
				if (typeOnly) return;
				throw new Error(
					`The Lab SDK is a type-only dependency: ${path} must use import type or export type`,
				);
			}
			if (isAbsolute(specifier) || specifier.startsWith("file:"))
				throw new Error(
					`Case source must import local files through the project snapshot: ${path} imports ${specifier}`,
				);
			const target = specifier.startsWith(".")
				? resolve(dirname(filename), specifier)
				: ts.resolveModuleName(specifier, filename, options, host)
						.resolvedModule;
			if (
				!target ||
				(typeof target !== "string" && target.isExternalLibraryImport)
			)
				return;
			const local = relative(
				rootPath,
				typeof target === "string" ? target : target.resolvedFileName,
			);
			if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local))
				throw new Error(
					`Local import escapes the saved project snapshot: ${path} imports ${specifier}`,
				);
		};
		const visit = (node: ts.Node): void => {
			if (
				(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
				node.moduleSpecifier &&
				ts.isStringLiteralLike(node.moduleSpecifier)
			) {
				const clause = ts.isImportDeclaration(node)
					? node.importClause?.namedBindings
					: node.exportClause;
				const allSpecifiersAreTypes = Boolean(
					clause &&
						(ts.isNamedImports(clause) || ts.isNamedExports(clause)) &&
						clause.elements.length > 0 &&
						clause.elements.every((element) => element.isTypeOnly),
				);
				const typeOnly = ts.isImportDeclaration(node)
					? Boolean(
							node.importClause?.isTypeOnly ||
								(!node.importClause?.name && allSpecifiersAreTypes),
						)
					: node.isTypeOnly || allSpecifiersAreTypes;
				check(node.moduleSpecifier.text, typeOnly);
			}
			if (
				ts.isImportEqualsDeclaration(node) &&
				ts.isExternalModuleReference(node.moduleReference) &&
				node.moduleReference.expression &&
				ts.isStringLiteralLike(node.moduleReference.expression)
			)
				check(node.moduleReference.expression.text, node.isTypeOnly);
			if (
				ts.isCallExpression(node) &&
				(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
					(ts.isIdentifier(node.expression) &&
						node.expression.text === "require")) &&
				node.arguments[0] &&
				ts.isStringLiteralLike(node.arguments[0])
			)
				check(node.arguments[0].text);
			ts.forEachChild(node, visit);
		};
		visit(module);
	}
}
