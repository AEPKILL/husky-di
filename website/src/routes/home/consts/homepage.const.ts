/**
 * @overview Content constants for the Husky DI website homepage.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

export const HOME_PAGE_LINKS = {
	documentation:
		"https://github.com/AEPKILL/husky-di/blob/main/packages/core/README.md#quick-start",
	github: "https://github.com/AEPKILL/husky-di",
	changelog:
		"https://github.com/AEPKILL/husky-di/blob/main/packages/core/CHANGELOG.md",
} as const;

export const HOME_PAGE_HERO_BADGE_LABEL = "Type-Safe & Deterministic";

export const HOME_PAGE_HERO_TITLE_LINES = [
	"Deterministic",
	"Reliability Built-in",
] as const;

export const HOME_PAGE_HERO_DESCRIPTION =
	"A modern, low-overhead DI container for TypeScript. Built for developers who want explicit service graphs, predictable resolution rules, and rock-solid runtime clarity.";

export const HOME_PAGE_HERO_PRIMARY_ACTION = {
	label: "Get Started",
	href: HOME_PAGE_LINKS.documentation,
} as const;

export const HOME_PAGE_HERO_SECONDARY_ACTION = {
	label: "View on GitHub",
	href: HOME_PAGE_LINKS.github,
} as const;

export const HOME_PAGE_INSTALL_COMMAND = "npm install @husky-di/core";

export const HOME_PAGE_FOOTER_COPYRIGHT =
	"© 2026 Husky DI. Deterministic architecture.";

export const HOME_PAGE_FOOTER_TAGLINE =
	"Built for the modern TypeScript stack.";

export const HOME_PAGE_FOOTER_NAV_ITEMS = [
	{ label: "Discord" },
	{ label: "Twitter" },
	{ label: "Changelog", href: HOME_PAGE_LINKS.changelog },
] as const;

export const HOME_PAGE_FOOTER_STATUS_LABEL = "Status: Operational";
