/**
 * @overview Content constants for the Husky DI website homepage.
 * @author AEPKILL
 * @created 2026-06-30 12:35:00
 */

export const HOME_PAGE_LINKS = {
	documentation:
		"https://github.com/AEPKILL/husky-di/tree/main/packages/core#quick-start",
	github: "https://github.com/AEPKILL/husky-di",
	changelog:
		"https://github.com/AEPKILL/husky-di/blob/main/packages/core/CHANGELOG.md",
} as const;

export const HOME_PAGE_VERSION_LABEL = "v1.4.1";

export const HOME_PAGE_HERO_BADGE_LABEL = "Type-Safe & Deterministic";

export const HOME_PAGE_HERO_TITLE_LINES = [
	"Deterministic",
	"Reliability Built-in",
] as const;

export const HOME_PAGE_HERO_DESCRIPTION =
	"A modern, zero-overhead DI container for TypeScript. Built for developers who want explicit service graphs, predictable resolution rules, and rock-solid runtime clarity.";

export const HOME_PAGE_HERO_PRIMARY_ACTION = {
	label: "Get Started",
	href: HOME_PAGE_LINKS.documentation,
} as const;

export const HOME_PAGE_HERO_SECONDARY_ACTION = {
	label: "View on GitHub",
	href: HOME_PAGE_LINKS.github,
} as const;

export const HOME_PAGE_FEATURE_GRID_ITEMS = [
	{
		icon: "bolt",
		title: "Zero Magic",
		description:
			"Explicit registration keeps the container lean and predictable. No hidden runtime wiring and no surprise injection rules.",
	},
	{
		icon: "shield",
		title: "Type-Safe",
		description:
			"Use createServiceIdentifier<T>() and keep your runtime names aligned with the TypeScript types your application depends on.",
	},
	{
		icon: "settings_input_component",
		title: "Deterministic",
		description:
			"Resolution order, container scoping, and lifecycle behavior stay stable so debugging a dependency graph feels mechanical, not mysterious.",
	},
] as const;

export const HOME_PAGE_DEPENDENCY_GRAPH_TITLE = "Clarity by Design";

export const HOME_PAGE_DEPENDENCY_GRAPH_DESCRIPTION =
	"Visualize your architecture through a deterministic dependency graph. Husky DI treats your application as a structured system, where every registration and resolution rule can be inspected before it becomes a production problem.";

export const HOME_PAGE_DEPENDENCY_GRAPH_BULLETS = [
	"Automatic Cycle Detection",
	"resolve() Helper and Ref Support",
	"Scoped Lifecycles (Singleton, Transient, Resolution)",
] as const;

export const HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_URL =
	"https://lh3.googleusercontent.com/aida-public/AB6AXuDhn2K3a5A4_nsWk4Jkng6jB8bVt4smfh-l0vdSfrcbb-pT--uuNewXHdQgdnNNbINUylygGTrAdJrVBRgxtEs03MhZO5KnI80ZESfasDmAD-xDyx4179tmiwndb-W1TlNfL1rZTvoYWplzZaXHJSK3nMOC-v_9YKbwOuRxEr4t0hR3vh2ZqZcLQm_Va86rHuRvByEacOSpql5-scNANheIAicjIxJvbCyOYqvzzlc1eFld-gy9raKA02RswPnKcLFZ3woIbtFL_Ko";

export const HOME_PAGE_DEPENDENCY_GRAPH_IMAGE_ALT =
	"A sophisticated dependency graph dashboard with glowing green edges and structured service nodes on a dark technical interface.";

export const HOME_PAGE_CODE_BLOCK_FILE_NAME = "example_usage.ts";

export const HOME_PAGE_INSTALL_COMMAND = {
	command: "npm install @husky-di/core",
	codeSample: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) {
    console.log(message);
  }
}

class UserService {
  private readonly logger = resolve(ILogger);
}

const ILogger = createServiceIdentifier<Logger>("ILogger");
const container = createContainer("AppContainer");

container.register(ILogger, {
  useClass: ConsoleLogger,
});

container.resolve(ILogger);`,
} as const;

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
