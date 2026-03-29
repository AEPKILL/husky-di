/**
 * @overview Repository code standard validator.
 * @author AEPKILL
 * @created 2026-03-29 21:35:00
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import * as ts from "typescript";

export interface ICodeStandardDiagnostic {
	readonly ruleId: string;
	readonly filePath: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
}

const ignoredDirectoryNames = new Set([
	".agents",
	".git",
	"coverage",
	"dist",
	"docs",
	"node_modules",
]);

const allowedSourceDirectoryNames = new Set([
	"constants",
	"decorators",
	"enums",
	"exceptions",
	"factories",
	"impls",
	"interfaces",
	"middlewares",
	"shared",
	"types",
	"typings",
	"utils",
]);

const requiredSuffixBySourceDirectory = new Map<string, string>([
	["constants", ".const.ts"],
	["decorators", ".decorator.ts"],
	["enums", ".enum.ts"],
	["exceptions", ".exception.ts"],
	["factories", ".factory.ts"],
	["interfaces", ".interface.ts"],
	["middlewares", ".middleware.ts"],
	["types", ".type.ts"],
	["typings", ".d.ts"],
	["utils", ".utils.ts"],
]);

export function validateCodeStandard(
	rootDirectoryPath: string,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const filePath of collectInScopeFiles(rootDirectoryPath)) {
		const sourceText = readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			getScriptKind(filePath),
		);
		const relativeFilePath = toPortablePath(
			relative(rootDirectoryPath, filePath),
		);

		diagnostics.push(
			...validateHeaderMetadata(relativeFilePath, sourceFile, sourceText),
		);
		diagnostics.push(...validateFilePlacement(relativeFilePath, sourceFile));
		diagnostics.push(...validateDefaultExports(relativeFilePath, sourceFile));
		diagnostics.push(...validateEntrypointShape(relativeFilePath, sourceFile));
		diagnostics.push(...validateImportSpecifiers(relativeFilePath, sourceFile));
		diagnostics.push(
			...validateBiomeIgnoreComments(relativeFilePath, sourceFile, sourceText),
		);
	}

	return diagnostics.sort((left, right) => {
		return (
			left.filePath.localeCompare(right.filePath) ||
			left.line - right.line ||
			left.column - right.column ||
			left.ruleId.localeCompare(right.ruleId)
		);
	});
}

function collectInScopeFiles(rootDirectoryPath: string): string[] {
	const filePaths: string[] = [];

	const packagesDirectoryPath = join(rootDirectoryPath, "packages");
	if (existsSync(packagesDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(packagesDirectoryPath));
	}

	const scriptsDirectoryPath = join(rootDirectoryPath, "scripts");
	if (existsSync(scriptsDirectoryPath)) {
		filePaths.push(...collectDirectoryFiles(scriptsDirectoryPath));
	}

	return filePaths
		.filter((filePath) => isInScopeFile(rootDirectoryPath, filePath))
		.sort((left, right) => left.localeCompare(right));
}

function collectDirectoryFiles(directoryPath: string): string[] {
	const filePaths: string[] = [];

	for (const directoryEntry of readdirSync(directoryPath)) {
		if (ignoredDirectoryNames.has(directoryEntry)) {
			continue;
		}

		const entryPath = join(directoryPath, directoryEntry);
		if (statSync(entryPath).isDirectory()) {
			filePaths.push(...collectDirectoryFiles(entryPath));
			continue;
		}

		filePaths.push(entryPath);
	}

	return filePaths;
}

function isInScopeFile(rootDirectoryPath: string, filePath: string): boolean {
	const relativeFilePath = toPortablePath(
		relative(rootDirectoryPath, filePath),
	);

	if (!relativeFilePath.endsWith(".ts")) {
		return false;
	}

	const pathSegments = relativeFilePath.split("/");
	if (pathSegments[0] === "scripts") {
		return true;
	}

	if (pathSegments[0] !== "packages" || pathSegments.length < 4) {
		return false;
	}

	return pathSegments[2] === "src" || pathSegments[2] === "tests";
}

function validateHeaderMetadata(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): ICodeStandardDiagnostic[] {
	const commentRanges = ts.getLeadingCommentRanges(sourceText, 0) ?? [];
	if (commentRanges.length === 0) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				0,
				"File header must include @overview, @author, and @created.",
			),
		];
	}

	const headerCommentRange = commentRanges[0];
	if (headerCommentRange.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				headerCommentRange.pos,
				"File header must be a block comment with @overview, @author, and @created.",
			),
		];
	}

	const headerCommentText = sourceText.slice(
		headerCommentRange.pos,
		headerCommentRange.end,
	);
	if (
		!headerCommentText.includes("@overview") ||
		!headerCommentText.includes("@author") ||
		!headerCommentText.includes("@created")
	) {
		return [
			createDiagnostic(
				"headers/required-metadata",
				relativeFilePath,
				sourceFile,
				headerCommentRange.pos,
				"File header must include @overview, @author, and @created.",
			),
		];
	}

	return [];
}

function validateFilePlacement(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const pathSegments = relativeFilePath.split("/");
	const fileName = pathSegments[pathSegments.length - 1];

	if (pathSegments[0] === "scripts") {
		return [];
	}

	const packageArea = pathSegments[2];
	if (packageArea === "tests") {
		if (fileName === "test.utils.ts" || fileName.endsWith(".test.ts")) {
			return [];
		}

		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				"Files in package tests must be named *.test.ts or test.utils.ts.",
			),
		];
	}

	if (pathSegments.length === 4) {
		if (fileName === "index.ts") {
			return [];
		}

		return [
			createDiagnostic(
				"placement/source-directory",
				relativeFilePath,
				sourceFile,
				0,
				"Package source files must live in an existing semantic directory or be src/index.ts.",
			),
		];
	}

	const sourceDirectoryName = pathSegments[3];
	if (!allowedSourceDirectoryNames.has(sourceDirectoryName)) {
		return [
			createDiagnostic(
				"placement/source-directory",
				relativeFilePath,
				sourceFile,
				0,
				`Unknown source directory "${sourceDirectoryName}".`,
			),
		];
	}

	if (sourceDirectoryName === "impls") {
		if (isPascalCaseTypeScriptFile(fileName)) {
			return [];
		}

		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				"Implementation files must use PascalCase.ts under src/impls.",
			),
		];
	}

	const requiredSuffix =
		requiredSuffixBySourceDirectory.get(sourceDirectoryName);
	if (requiredSuffix && !fileName.endsWith(requiredSuffix)) {
		return [
			createDiagnostic(
				"naming/file-name",
				relativeFilePath,
				sourceFile,
				0,
				`Files in src/${sourceDirectoryName} must end with ${requiredSuffix}.`,
			),
		];
	}

	return [];
}

function validateDefaultExports(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (ts.isExportAssignment(statement)) {
			diagnostics.push(
				createDiagnostic(
					"exports/no-default-export",
					relativeFilePath,
					sourceFile,
					statement.getStart(sourceFile),
					"Default exports are not allowed in the enforcement scope.",
				),
			);
			continue;
		}

		if (!ts.canHaveModifiers(statement)) {
			continue;
		}

		const modifiers = ts.getModifiers(statement) ?? [];
		const hasDefaultModifier = modifiers.some(
			(modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
		);
		if (!hasDefaultModifier) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				"exports/no-default-export",
				relativeFilePath,
				sourceFile,
				statement.getStart(sourceFile),
				"Default exports are not allowed in the enforcement scope.",
			),
		);
	}

	return diagnostics;
}

function validateEntrypointShape(
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
				"entrypoint/export-only",
				relativeFilePath,
				sourceFile,
				statement.getStart(sourceFile),
				"src/index.ts may only contain imports, export declarations, and stable constant forwarding.",
			),
		];
	}

	return [];
}

function validateImportSpecifiers(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement)) {
			continue;
		}

		const moduleSpecifierText = statement.moduleSpecifier.getText(sourceFile);
		const normalizedSpecifierText = moduleSpecifierText.slice(1, -1);
		if (!normalizedSpecifierText.startsWith("@husky-di/")) {
			continue;
		}

		const packagePathSegments = normalizedSpecifierText
			.slice("@husky-di/".length)
			.split("/");
		if (packagePathSegments.length <= 1) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				"imports/no-internal-package-path",
				relativeFilePath,
				sourceFile,
				statement.moduleSpecifier.getStart(sourceFile),
				"Cross-package imports must use the package root entrypoint, not internal source paths.",
			),
		);
	}

	return diagnostics;
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

	if (ts.isPropertyAccessExpression(expression)) {
		return isStableForwardingExpression(
			expression.expression,
			importedBindingNames,
		);
	}

	if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression)) {
		return isStableForwardingExpression(
			expression.expression,
			importedBindingNames,
		);
	}

	if (
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

function validateBiomeIgnoreComments(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): ICodeStandardDiagnostic[] {
	const diagnostics: ICodeStandardDiagnostic[] = [];
	const scanner = ts.createScanner(
		ts.ScriptTarget.Latest,
		false,
		ts.LanguageVariant.Standard,
		sourceText,
	);

	let token = scanner.scan();
	while (token !== ts.SyntaxKind.EndOfFileToken) {
		if (
			token === ts.SyntaxKind.SingleLineCommentTrivia ||
			token === ts.SyntaxKind.MultiLineCommentTrivia
		) {
			const tokenText = trimCommentDelimiters(scanner.getTokenText()).trim();
			if (tokenText.startsWith("biome-ignore")) {
				const separatorIndex = tokenText.indexOf(":");
				const reasonText =
					separatorIndex >= 0 ? tokenText.slice(separatorIndex + 1).trim() : "";
				if (reasonText.length === 0) {
					diagnostics.push(
						createDiagnostic(
							"comments/biome-ignore-reason",
							relativeFilePath,
							sourceFile,
							scanner.getTokenPos(),
							"biome-ignore comments must include an explicit reason after ':'.",
						),
					);
				}
			}
		}

		token = scanner.scan();
	}

	return diagnostics;
}

function trimCommentDelimiters(commentText: string): string {
	if (commentText.startsWith("//")) {
		return commentText.slice(2);
	}

	if (commentText.startsWith("/*") && commentText.endsWith("*/")) {
		return commentText.slice(2, -2);
	}

	return commentText;
}

function isPascalCaseTypeScriptFile(fileName: string): boolean {
	if (!fileName.endsWith(".ts") || fileName.endsWith(".d.ts")) {
		return false;
	}

	const baseName = fileName.slice(0, -3);
	if (baseName.length === 0) {
		return false;
	}

	const firstCharacter = baseName[0];
	if (firstCharacter !== firstCharacter.toUpperCase()) {
		return false;
	}

	for (const character of baseName) {
		const isLetter = character.toLowerCase() !== character.toUpperCase();
		const isNumber = character >= "0" && character <= "9";
		if (!isLetter && !isNumber) {
			return false;
		}
	}

	return true;
}

function createDiagnostic(
	ruleId: string,
	filePath: string,
	sourceFile: ts.SourceFile,
	position: number,
	message: string,
): ICodeStandardDiagnostic {
	const location = sourceFile.getLineAndCharacterOfPosition(position);
	return {
		ruleId,
		filePath,
		line: location.line + 1,
		column: location.character + 1,
		message,
	};
}

function getScriptKind(filePath: string): ts.ScriptKind {
	if (filePath.endsWith(".d.ts")) {
		return ts.ScriptKind.TS;
	}

	return ts.ScriptKind.TS;
}

function toPortablePath(filePath: string): string {
	return filePath.split(sep).join("/");
}

function runCli(): number {
	const diagnostics = validateCodeStandard(process.cwd());
	if (diagnostics.length === 0) {
		console.log("Code standard check passed.");
		return 0;
	}

	for (const diagnostic of diagnostics) {
		console.error(
			`[${diagnostic.ruleId}] ${diagnostic.filePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.message}`,
		);
	}

	return 1;
}

const entryFilePath = process.argv[1];
if (entryFilePath && import.meta.url === pathToFileURL(entryFilePath).href) {
	process.exit(runCli());
}
