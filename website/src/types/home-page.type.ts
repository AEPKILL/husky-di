/**
 * @overview Home page type contracts for the Husky DI documentation website.
 * @author Codex
 * @created 2026-06-25 21:40:00
 */

import type { TwoslashSnippetId } from "@/constants/twoslash-snippets.const";

export interface INavigationLink {
	description?: string;
	href?: string;
	isExternal?: boolean;
	label: string;
	to?: string;
}

export interface IHeroMetric {
	label: string;
	value: string;
}

export interface IConceptStory {
	accentClassName: string;
	accentHex: string;
	codeBlockId: TwoslashSnippetId;
	description: string;
	demoKind:
		| "container"
		| "resolution"
		| "lifecycle"
		| "refs"
		| "modules"
		| "testing";
	eyebrow: string;
	id: string;
	points: string[];
	title: string;
}

export interface IDocumentationJumpLink {
	accentClassName: string;
	description: string;
	label: string;
	to: string;
}
