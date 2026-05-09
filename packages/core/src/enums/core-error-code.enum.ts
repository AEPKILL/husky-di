/**
 * @overview Core package error code enum.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

export enum CoreErrorCodeEnum {
	/**
	 * Registration does not specify a supported provider strategy.
	 * @see SPECIFICATION.md Section 4.1 R1
	 */
	E_INVALID_PROVIDER = "E_INVALID_PROVIDER",

	/**
	 * Service cannot be found in the current container hierarchy.
	 * @see SPECIFICATION.md Section 4.2 S3
	 */
	E_SERVICE_NOT_FOUND = "E_SERVICE_NOT_FOUND",

	/**
	 * Circular dependency detected during resolution.
	 * @see SPECIFICATION.md Section 4.4 C1
	 */
	E_CIRCULAR_DEPENDENCY = "E_CIRCULAR_DEPENDENCY",

	/**
	 * Operation attempted on a disposed container.
	 * @see SPECIFICATION.md Section 4.7 D1
	 */
	E_CONTAINER_DISPOSED = "E_CONTAINER_DISPOSED",

	/**
	 * Invalid resolve options were provided.
	 * @see SPECIFICATION.md Section 5.2 V6
	 */
	E_INVALID_OPTIONS = "E_INVALID_OPTIONS",

	/**
	 * Resolution failed while constructing or invoking a provider.
	 */
	E_RESOLUTION_FAILED = "E_RESOLUTION_FAILED",

	/**
	 * The resolve helper was called without an active resolution context.
	 */
	E_RESOLVE_CONTEXT_UNAVAILABLE = "E_RESOLVE_CONTEXT_UNAVAILABLE",
}
