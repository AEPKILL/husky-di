/**
 * @overview Types for the Code Hike scrollycoding demo route.
 * @author AEPKILL
 * @created 2026-06-30 11:38:00
 */

import type { HighlightedCode } from "codehike/code";

export type CodehikeScrollyDemoStep = Readonly<{
	id: string;
	eyebrow: string;
	fileName: string;
	focusLineIndex?: number;
	title: string;
	summary: string;
	details: readonly string[];
	code: HighlightedCode;
}>;
