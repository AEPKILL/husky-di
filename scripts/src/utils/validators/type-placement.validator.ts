/**
 * Type placement validator.
 *
 * @overview
 * Validates that type aliases are placed in the types/ directory.
 * Type aliases should not be declared outside of types/ directory.
 *
 * @author AEPKILL
 * @created 2026-03-31 11:45:00
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.type";
import { createDiagnostic } from "../create-diagnostic.utils";

export function validateTypePlacement(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];

	for (const statement of sourceFile.statements) {
		if (!ts.isTypeAliasDeclaration(statement)) {
			continue;
		}

		if (relativeFilePath.includes("/types/")) {
			continue;
		}

		if (
			relativeFilePath.includes("/interfaces/") ||
			relativeFilePath.includes("/enums/") ||
			relativeFilePath.includes("/consts/") ||
			relativeFilePath.includes("/constants/") ||
			relativeFilePath.includes("/factories/") ||
			relativeFilePath.includes("/utils/") ||
			relativeFilePath.includes("/validators/")
		) {
			continue;
		}

		const fileName = relativeFilePath.split("/").pop() ?? "";
		if (fileName.endsWith(".type.ts")) {
			continue;
		}

		diagnostics.push(
			createDiagnostic(
				CodeStandardRuleIdEnum.PlacementType,
				relativeFilePath,
				sourceFile,
				statement.name.getStart(sourceFile),
				`Type alias "${statement.name.text}" should be placed in types/ directory or in a .type.ts file.`,
			),
		);
	}

	return diagnostics;
}
