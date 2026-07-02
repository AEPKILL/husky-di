/**
 * @overview Shared step id generator for homepage tutorial sections and their
 * corresponding code previews.
 * @author AEPKILL
 * @created 2026-07-02 19:35:00
 */

export function createHomepageTutorialStepId(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
