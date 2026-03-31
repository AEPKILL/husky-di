/**
 * Code standard validator default configuration.
 *
 * @overview
 * Provides default configuration values for the code standard validator.
 * These values can be overridden by passing a custom configuration.
 *
 * @author AEPKILL
 * @created 2026-03-31 17:30:00
 */

import type { CodeStandardConfig } from "@/types/config.type";

export const DEFAULT_CONFIG: CodeStandardConfig = {
	ignoredDirectoryNames: [
		".agents",
		".git",
		"coverage",
		"dist",
		"docs",
		"node_modules",
	],
	packageRootNames: ["packages", "scripts"],
	sourceDirectoryNames: [
		"constants",
		"consts",
		"decorators",
		"enums",
		"exceptions",
		"factories",
		"impls",
		"interfaces",
		"middlewares",
		"shared",
		"types",
		"typings",
		"utils",
	],
	requiredSuffixBySourceDirectoryName: new Map([
		["constants", [".const.ts"]],
		["consts", [".const.ts"]],
		["decorators", [".decorator.ts"]],
		["enums", [".enum.ts"]],
		["exceptions", [".exception.ts"]],
		["factories", [".factory.ts"]],
		["interfaces", [".interface.ts"]],
		["middlewares", [".middleware.ts"]],
		["types", [".type.ts", ".d.ts"]],
		["typings", [".d.ts"]],
		["utils", [".utils.ts"]],
	]),
	exemptDirectoryNames: ["scripts"],
	packageScopePrefix: "@husky-di/",
	minimumPathSegments: 4,
};

export function createConfig(
	overrides: Partial<CodeStandardConfig>,
): CodeStandardConfig {
	return {
		...DEFAULT_CONFIG,
		...overrides,
	};
}
