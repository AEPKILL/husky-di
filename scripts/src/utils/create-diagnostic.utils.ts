/**
 * Diagnostic creation utility.
 *
 * @overview
 * Provides a helper function for creating code standard diagnostic objects.
 * Used by all validator utilities to report issues.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:28:59
 */

import type * as ts from "typescript";
import type { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/interfaces/code-standard-diagnostic.type";

export function createDiagnostic(
	ruleId: CodeStandardRuleIdEnum,
	filePath: string,
	sourceFile: ts.SourceFile,
	position: number,
	message: string,
): CodeStandardDiagnostic {
	const location = sourceFile.getLineAndCharacterOfPosition(position);
	return {
		ruleId,
		filePath,
		line: location.line + 1,
		column: location.character + 1,
		message,
	};
}
