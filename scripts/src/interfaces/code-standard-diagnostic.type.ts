/**
 * Code standard diagnostic type.
 *
 * @overview
 * Defines the structure for code standard violation diagnostics.
 * Used by the repository code standard validator to report issues.
 *
 * @author AEPKILL
 * @created 2026-03-30 20:22:20
 */

export type CodeStandardDiagnostic = {
	readonly ruleId: string;
	readonly filePath: string;
	readonly line: number;
	readonly column: number;
	readonly message: string;
};
