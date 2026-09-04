/**
 * Code standard validator main entry.
 *
 * @overview
 * Main validation function that orchestrates all code standard checks.
 * Collects in-scope files and runs all validators against them.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as ts from "typescript";
import { DEFAULT_CONFIG } from "@/config/code-standard.config";
import type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";
import type { CodeStandardConfig } from "@/types/config.type";
import { validateBiomeIgnoreComments } from "../validators/biome-ignore.validator";
import { validateConstantNaming } from "../validators/constant-naming.validator";
import { validateDefaultExports } from "../validators/default-exports.validator";
import { validateEntrypointShape } from "../validators/entrypoint-shape.validator";
import { validateEnumNaming } from "../validators/enum-naming.validator";
import { validateFilePlacement } from "../validators/file-placement.validator";
import { validateHeaderMetadata } from "../validators/header-metadata.validator";
import { validateImportSpecifiers } from "../validators/import-specifiers.validator";
import { validateInterfaceNaming } from "../validators/interface-naming.validator";
import { validateTypeFileExports } from "../validators/type-file-exports.validator";
import {
	collectDirectoryFiles,
	collectInScopeFiles,
} from "./file-collector.util";

export type { CodeStandardDiagnostic } from "@/types/code-standard-diagnostic.type";

export function validateCodeStandard(
	rootDirectoryPath: string,
	config: CodeStandardConfig = DEFAULT_CONFIG,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];
	const inScopeFilePaths = collectInScopeFiles(rootDirectoryPath, config);
	const typeFileValidationContexts =
		createTypeFileValidationContexts(inScopeFilePaths);
	const publicPackageImportSpecifiers = collectPublicPackageImportSpecifiers(
		rootDirectoryPath,
		config,
	);

	for (const filePath of inScopeFilePaths) {
		const sourceText = readFileSync(filePath, "utf8");
		const sourceFile = ts.createSourceFile(
			filePath,
			sourceText,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
		const relativeFilePath = toPortablePath(
			filePath.slice(rootDirectoryPath.length + 1),
		);
		const typeFileValidationContext = typeFileValidationContexts.get(filePath);

		diagnostics.push(
			...validateHeaderMetadata(relativeFilePath, sourceFile, sourceText),
		);
		diagnostics.push(
			...validateFilePlacement(relativeFilePath, sourceFile, config),
		);
		diagnostics.push(...validateEnumNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateConstantNaming(relativeFilePath, sourceFile));
		diagnostics.push(...validateInterfaceNaming(relativeFilePath, sourceFile));
		diagnostics.push(
			...validateTypeFileExports(
				relativeFilePath,
				typeFileValidationContext?.sourceFile ?? sourceFile,
				typeFileValidationContext?.typeChecker,
				typeFileValidationContext?.zodSchemaType,
			),
		);
		diagnostics.push(...validateDefaultExports(relativeFilePath, sourceFile));
		diagnostics.push(...validateEntrypointShape(relativeFilePath, sourceFile));
		diagnostics.push(
			...validateImportSpecifiers(
				relativeFilePath,
				sourceFile,
				config,
				publicPackageImportSpecifiers,
			),
		);
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

type TypeFileValidationContext = Readonly<{
	sourceFile: ts.SourceFile;
	typeChecker: ts.TypeChecker;
	zodSchemaType: ts.Type | undefined;
}>;

function createTypeFileValidationContexts(
	filePaths: readonly string[],
): ReadonlyMap<string, TypeFileValidationContext> {
	const typeFilePaths = filePaths.filter((filePath) =>
		filePath.endsWith(".type.ts"),
	);
	const filePathsByConfig = new Map<string, string[]>();
	for (const filePath of typeFilePaths) {
		const configPath =
			ts.findConfigFile(dirname(filePath), ts.sys.fileExists) ?? "";
		const configFilePaths = filePathsByConfig.get(configPath) ?? [];
		configFilePaths.push(filePath);
		filePathsByConfig.set(configPath, configFilePaths);
	}

	const contexts = new Map<string, TypeFileValidationContext>();
	for (const [configPath, configFilePaths] of filePathsByConfig) {
		const program = ts.createProgram({
			rootNames: configFilePaths,
			options: readCompilerOptions(configPath),
		});
		const typeChecker = program.getTypeChecker();
		const zodSchemaType = findZodSchemaType(program, typeChecker);
		for (const filePath of configFilePaths) {
			const sourceFile = program.getSourceFile(filePath);
			if (sourceFile !== undefined) {
				contexts.set(filePath, {
					sourceFile,
					typeChecker,
					zodSchemaType,
				});
			}
		}
	}
	return contexts;
}

function findZodSchemaType(
	program: ts.Program,
	typeChecker: ts.TypeChecker,
): ts.Type | undefined {
	for (const sourceFile of program.getSourceFiles()) {
		for (const statement of sourceFile.statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier) ||
				statement.moduleSpecifier.text !== "zod"
			) {
				continue;
			}
			const moduleSymbol = typeChecker.getSymbolAtLocation(
				statement.moduleSpecifier,
			);
			if (moduleSymbol === undefined) {
				continue;
			}
			const factorySymbol = typeChecker
				.getExportsOfModule(moduleSymbol)
				.find((symbol) => symbol.name === "fromJSONSchema");
			if (factorySymbol === undefined) {
				continue;
			}
			const factoryType = typeChecker.getTypeOfSymbolAtLocation(
				factorySymbol,
				statement.moduleSpecifier,
			);
			const signature = typeChecker.getSignaturesOfType(
				factoryType,
				ts.SignatureKind.Call,
			)[0];
			if (signature !== undefined) {
				return typeChecker.getReturnTypeOfSignature(signature);
			}
		}
	}
	return undefined;
}

function readCompilerOptions(configPath: string): ts.CompilerOptions {
	if (configPath === "") {
		return FALLBACK_COMPILER_OPTIONS;
	}
	const configResult = ts.readConfigFile(configPath, ts.sys.readFile);
	if (configResult.error !== undefined) {
		return FALLBACK_COMPILER_OPTIONS;
	}
	return ts.parseJsonConfigFileContent(
		configResult.config,
		ts.sys,
		dirname(configPath),
		undefined,
		configPath,
	).options;
}

const FALLBACK_COMPILER_OPTIONS: ts.CompilerOptions = {
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	noEmit: true,
	skipLibCheck: true,
	strict: true,
	target: ts.ScriptTarget.ESNext,
};

function collectPublicPackageImportSpecifiers(
	rootDirectoryPath: string,
	config: CodeStandardConfig,
): ReadonlySet<string> {
	const specifiers = new Set<string>();

	for (const packageRootName of config.packageRootNames) {
		const packageRootPath = join(rootDirectoryPath, packageRootName);
		if (!existsSync(packageRootPath)) {
			continue;
		}

		for (const filePath of collectDirectoryFiles(packageRootPath, config)) {
			if (!filePath.endsWith("package.json")) {
				continue;
			}
			const manifest = JSON.parse(readFileSync(filePath, "utf8")) as {
				readonly name?: unknown;
				readonly exports?: unknown;
			};
			if (
				typeof manifest.name !== "string" ||
				!manifest.name.startsWith(config.packageScopePrefix) ||
				typeof manifest.exports !== "object" ||
				manifest.exports === null
			) {
				continue;
			}

			for (const key of Object.keys(manifest.exports)) {
				if (key.startsWith("./") && !key.includes("*")) {
					specifiers.add(`${manifest.name}/${key.slice(2)}`);
				}
			}
		}
	}

	return specifiers;
}

function toPortablePath(filePath: string): string {
	return filePath.split("\\").join("/");
}
