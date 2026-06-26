/**
 * @overview Narrative content and navigation constants for the Husky DI
 * documentation homepage.
 * @author Codex
 * @created 2026-06-25 21:40:00
 */

import type {
	IConceptStory,
	IDocumentationJumpLink,
	IHeroMetric,
	INavigationLink,
} from "@/types/home-page.type";

export const PRIMARY_NAVIGATION_LINKS: INavigationLink[] = [
	{
		label: "Why Husky DI",
		to: "/",
	},
	{
		label: "Getting Started",
		to: "/guides/getting-started",
	},
	{
		label: "Guides",
		to: "/guides",
	},
	{
		label: "Reference",
		to: "/reference",
	},
	{
		href: "https://github.com/aepkill/husky-di",
		isExternal: true,
		label: "GitHub",
	},
];

export const HERO_METRICS: IHeroMetric[] = [
	{
		label: "Core package",
		value: "@husky-di/core",
	},
	{
		label: "Onboarding path",
		value: "Principles -> Proof -> Reference",
	},
	{
		label: "Architecture focus",
		value: "Frontend, backend, CLI",
	},
];

export const CONCEPT_STORIES: IConceptStory[] = [
	{
		accentClassName: "color-container",
		accentHex: "#FF4B4B",
		codeBlockId: "story-container",
		description:
			"Object graphs belong at the edge. Husky DI makes the composition root visible instead of hiding construction inside business code.",
		demoKind: "container",
		eyebrow: "Container / Composition Root",
		id: "container",
		points: [
			"Keep policy code free from direct construction.",
			"Show the assembly boundary before any framework abstraction appears.",
			"Start from the smallest runnable example and expand from there.",
		],
		title: "Compose object graphs at the edge.",
	},
	{
		accentClassName: "color-resolution",
		accentHex: "#FFA828",
		codeBlockId: "story-resolution",
		description:
			"Resolution is explicit, typed, and introspectable. Readers can see how services are wired instead of inferring it from hidden side effects.",
		demoKind: "resolution",
		eyebrow: "Registration / Resolution",
		id: "resolution",
		points: [
			"Teach last-write-wins and multi-resolution clearly.",
			"Surface typed identifiers and deterministic resolution order.",
			"Expose resolution traces that help debug why a dependency was chosen.",
		],
		title: "Trace every decision in the container.",
	},
	{
		accentClassName: "color-lifecycle",
		accentHex: "#00FFAA",
		codeBlockId: "story-lifecycle",
		description:
			"Lifecycle differences are easier to trust when the website shows the reuse rules as a live visual instead of a table alone.",
		demoKind: "lifecycle",
		eyebrow: "Lifecycle / Scope",
		id: "lifecycle",
		points: [
			"Compare transient, singleton, and resolution-scoped services in one frame.",
			"Show where caching happens and where it does not.",
			"Keep the explanation architectural, not just API-oriented.",
		],
		title: "Make instance reuse visible.",
	},
	{
		accentClassName: "color-refs",
		accentHex: "#4D9CFF",
		codeBlockId: "story-refs",
		description:
			"Refs and escape hatches need careful teaching. The homepage should show why they exist, when they help, and what tradeoff they introduce.",
		demoKind: "refs",
		eyebrow: "Refs / Circular Escape Hatches",
		id: "refs",
		points: [
			"Reveal circular paths instead of hand-waving them away.",
			"Separate deferred refs from dynamic re-resolution.",
			"Warn when an escape hatch adds complexity or memory pressure.",
		],
		title: "Handle circular edges without hiding the cost.",
	},
	{
		accentClassName: "color-modules",
		accentHex: "#05DBE9",
		codeBlockId: "story-modules",
		description:
			"Modules should feel like architectural boundaries, not just another registration helper. Import and export rules deserve a chapter of their own.",
		demoKind: "modules",
		eyebrow: "Modules / Boundaries",
		id: "modules",
		points: [
			"Map ESM mental models onto DI boundaries.",
			"Show declaration, import, export, and alias roles visually.",
			"Keep conflicts obvious before runtime ambiguity appears.",
		],
		title: "Treat boundaries like first-class design material.",
	},
	{
		accentClassName: "color-testing",
		accentHex: "#B7FF54",
		codeBlockId: "story-testing",
		description:
			"The payoff chapter must show why teams care: faster tests, replaceable infrastructure, and fewer reasons to couple business behavior to unstable details.",
		demoKind: "testing",
		eyebrow: "Testing / Replaceability",
		id: "testing",
		points: [
			"Compare direct construction against a replaceable composition root.",
			"Highlight faster swaps for infrastructure in tests and local demos.",
			"End on practical engineering value, not abstract purity.",
		],
		title: "Swap detail implementations without rewriting policy.",
	},
];

export const DOCUMENTATION_JUMP_LINKS: IDocumentationJumpLink[] = [
	{
		accentClassName: "color-container",
		description:
			"See the smallest useful setup and the before/after refactor path.",
		label: "Getting Started",
		to: "/guides/getting-started",
	},
	{
		accentClassName: "color-resolution",
		description:
			"Read the narrative guides that teach the mental model before the API surface.",
		label: "Guides",
		to: "/guides",
	},
	{
		accentClassName: "color-modules",
		description:
			"Jump to stable contracts, package boundaries, and public semantics.",
		label: "Reference",
		to: "/reference",
	},
	{
		accentClassName: "color-testing",
		description:
			"Inspect the core package topics readers depend on most often.",
		label: "Core Reference",
		to: "/reference/core",
	},
	{
		accentClassName: "color-lifecycle",
		description:
			"Follow architecture notes, ADRs, and roadmap-driven documentation decisions.",
		label: "Writing Docs",
		to: "/guides/writing-docs",
	},
];
