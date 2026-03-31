/**
 * Header metadata validator.
 *
 * @overview
 * Validates that TypeScript files include required metadata in their header comments.
 * Checks for @overview, @author, and @created tags.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "../../enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "../../interfaces/code-standard-diagnostic.type";
import { createDiagnostic } from "../create-diagnostic.utils";

export function validateHeaderMetadata(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): CodeStandardDiagnostic[] {
	const commentRanges = ts.getLeadingCommentRanges(sourceText, 0) ?? [];
	if (commentRanges.length === 0) {
		return [
			createDiagnostic(
				CodeStandardRuleIdEnum.HeadersRequiredMetadata,
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
				CodeStandardRuleIdEnum.HeadersRequiredMetadata,
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
				CodeStandardRuleIdEnum.HeadersRequiredMetadata,
				relativeFilePath,
				sourceFile,
				headerCommentRange.pos,
				"File header must include @overview, @author, and @created.",
			),
		];
	}

	return [];
}
