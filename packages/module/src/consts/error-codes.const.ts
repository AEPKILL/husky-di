/**
 * @overview Error code constants for module package.
 * @author AEPKILL
 * @created 2025-03-30
 */

export const MODULE_ERROR_CODES = {
	/**
	 * Module contains multiple declarations with the same ServiceIdentifier.
	 * @see SPECIFICATION.md Section 4.1 D1
	 */
	E_DUPLICATE_DECLARATION: "E_DUPLICATE_DECLARATION",

	/**
	 * Declaration lacks valid registration strategy (useClass, useFactory, useValue, or useAlias).
	 * @see SPECIFICATION.md Section 4.1 D2
	 */
	E_INVALID_REGISTRATION: "E_INVALID_REGISTRATION",

	/**
	 * Same module instance imported multiple times in a single import list.
	 * @see SPECIFICATION.md Section 4.2 I1
	 */
	E_DUPLICATE_IMPORT_MODULE: "E_DUPLICATE_IMPORT_MODULE",

	/**
	 * Circular dependency detected in module import graph.
	 * @see SPECIFICATION.md Section 4.2 I2
	 */
	E_CIRCULAR_DEPENDENCY: "E_CIRCULAR_DEPENDENCY",

	/**
	 * Multiple imported modules export the same ServiceIdentifier without alias resolution.
	 * @see SPECIFICATION.md Section 4.2 I3
	 */
	E_IMPORT_COLLISION: "E_IMPORT_COLLISION",

	/**
	 * Alias source ServiceIdentifier is not exported by the source module.
	 * @see SPECIFICATION.md Section 5.1 Resolution Logic
	 */
	E_ALIAS_SOURCE_NOT_EXPORTED: "E_ALIAS_SOURCE_NOT_EXPORTED",

	/**
	 * Alias target conflicts with a local declaration in the importing module.
	 * @see SPECIFICATION.md Section 5.1 Resolution Logic
	 */
	E_ALIAS_CONFLICT_LOCAL: "E_ALIAS_CONFLICT_LOCAL",

	/**
	 * Same source ServiceIdentifier mapped multiple times within a single alias list.
	 * @see SPECIFICATION.md Section 5.1 Resolution Logic
	 */
	E_DUPLICATE_ALIAS_MAP: "E_DUPLICATE_ALIAS_MAP",

	/**
	 * Export references a ServiceIdentifier that is neither declared locally nor imported.
	 * @see SPECIFICATION.md Section 4.3 E1
	 */
	E_EXPORT_NOT_FOUND: "E_EXPORT_NOT_FOUND",

	/**
	 * Same ServiceIdentifier exported multiple times from a single module.
	 * @see SPECIFICATION.md Section 4.3 E2
	 */
	E_DUPLICATE_EXPORT: "E_DUPLICATE_EXPORT",
} as const;
