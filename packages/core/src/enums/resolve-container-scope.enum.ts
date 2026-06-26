/**
 * Resolve helper container scope enumeration.
 *
 * @overview
 * Defines which container perspective the package-level `resolve()` helper
 * should use when continuing nested resolution inside an active resolve chain.
 *
 * @author AEPKILL
 * @created 2026-06-26 00:00:00
 */
export enum ResolveContainerScopeEnum {
	/**
	 * Resolve from the container currently performing the active resolution step.
	 */
	current = "current",

	/**
	 * Resolve from the container that started the current resolution chain.
	 */
	origin = "origin",
}
