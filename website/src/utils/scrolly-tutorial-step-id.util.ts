/**
 * @overview Shared step id generator for scrolly tutorial sections and their
 * corresponding code previews.
 * @author AEPKILL
 * @created 2026-07-02 19:35:00
 */

export function createScrollyTutorialStepId(title: string): string {
	const stepId = title
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{Letter}\p{Number}]+/gu, "-")
		.replace(/^-+|-+$/g, "");

	return stepId || "step";
}
