/**
 * Code standard validator configuration types.
 *
 * @overview
 * Defines the structure for code standard validator configuration.
 * Allows customization of paths, rules, and validation behavior.
 *
 * @author AEPKILL
 * @created 2026-03-31 17:30:00
 */

export type CodeStandardConfig = {
	/**
	 * Directory names to ignore during file collection.
	 */
	readonly ignoredDirectoryNames: readonly string[];

	/**
	 * Package root directory names to scan for source files.
	 */
	readonly packageRootNames: readonly string[];

	/**
	 * Directory names that contain source files to validate.
	 */
	readonly sourceDirectoryNames: readonly string[];

	/**
	 * Map of source directory names to required file suffixes.
	 * Each entry can be a string suffix or a RegExp pattern.
	 * Multiple suffixes/patterns can be specified per directory.
	 */
	readonly requiredSuffixBySourceDirectoryName: ReadonlyMap<
		string,
		readonly (string | RegExp)[]
	>;

	/**
	 * Directory names that are exempt from code standard validation.
	 */
	readonly exemptDirectoryNames: readonly string[];

	/**
	 * The package scope prefix for cross-package import validation.
	 */
	readonly packageScopePrefix: string;

	/**
	 * Names of source directories to scan (e.g., ["src", "tests"]).
	 */
	readonly sourceDirectories: readonly string[];
};
