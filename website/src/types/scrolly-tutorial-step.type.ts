/**
 * @overview Shared step type for scrolly tutorial experiences in the website
 * workspace.
 * @author AEPKILL
 * @created 2026-06-30 13:53:17 20:05:00
 */

import type { HighlightedCode } from "codehike/code";

export type ScrollyTutorialStep = Readonly<{
	id: string;
	eyebrow: string;
	fileName: string;
	focusLineIndex?: number;
	title: string;
	summary: string;
	details: readonly string[];
	code: HighlightedCode;
}>;
