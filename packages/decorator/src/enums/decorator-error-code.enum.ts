/**
 * @overview Decorator package error code enum.
 * @author AEPKILL
 * @created 2026-05-09 00:00:00
 */

export enum DecoratorErrorCodeEnum {
	/**
	 * Class is decorated with @injectable() more than once.
	 * @see SPECIFICATION.md Section 4.1 M1
	 */
	E_DUPLICATE_INJECTABLE = "E_DUPLICATE_INJECTABLE",

	/**
	 * Constructor parameter without explicit metadata is not a class type.
	 * @see SPECIFICATION.md Section 4.1 M3
	 */
	E_NON_CLASS_PARAMETER = "E_NON_CLASS_PARAMETER",

	/**
	 * Class resolved through decorator middleware is not decorated with @injectable().
	 * @see SPECIFICATION.md Section 5.1 V1
	 */
	E_NOT_INJECTABLE = "E_NOT_INJECTABLE",

	/**
	 * Injection metadata does not include a serviceIdentifier.
	 * @see SPECIFICATION.md Section 4.3 T2
	 */
	E_MISSING_SERVICE_IDENTIFIER = "E_MISSING_SERVICE_IDENTIFIER",

	/**
	 * Injection metadata includes an invalid serviceIdentifier.
	 * @see SPECIFICATION.md Section 5.2 V3
	 */
	E_INVALID_SERVICE_IDENTIFIER = "E_INVALID_SERVICE_IDENTIFIER",

	/**
	 * Injection metadata enables dynamic and ref at the same time.
	 * @see SPECIFICATION.md Section 5.2 V4
	 */
	E_CONFLICTING_OPTIONS = "E_CONFLICTING_OPTIONS",

	/**
	 * Consolidated injection metadata is missing a parameter entry.
	 * @see SPECIFICATION.md Section 5.1 V2
	 */
	E_INCOMPLETE_METADATA = "E_INCOMPLETE_METADATA",
}
