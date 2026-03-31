/**
 * Biome ignore comments validator.
 *
 * @overview
 * Validates that biome-ignore comments include explicit reasons.
 * Ensures ignores are not used without justification.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

import * as ts from "typescript";
import { CodeStandardRuleIdEnum } from "@/enums/code-standard-rule-id.enum";
import type { CodeStandardDiagnostic } from "@/interfaces/code-standard-diagnostic.type";
import { createDiagnostic } from "@/utils/create-diagnostic.utils";

export function validateBiomeIgnoreComments(
	relativeFilePath: string,
	sourceFile: ts.SourceFile,
	sourceText: string,
): CodeStandardDiagnostic[] {
	const diagnostics: CodeStandardDiagnostic[] = [];
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
							CodeStandardRuleIdEnum.CommentsBiomeIgnoreReason,
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
