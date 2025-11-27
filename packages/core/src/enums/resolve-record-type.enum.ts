/**
 * Resolution record type enumeration.
 *
 * @overview
 * Defines the types of nodes in the resolution record tree structure.
 * Used to track and debug the dependency resolution process, including
 * circular dependency detection and resolution path visualization.
 *
 * @author AEPKILL
 * @created 2025-04-27 22:54:43
 */
export enum ResolveRecordTypeEnum {
	/** Root node representing the start of a resolution chain. */
	root = 0,

	/** Node representing a service identifier being resolved. */
	serviceIdentifier = 1,

	/** Node representing a message or annotation in the resolution chain. */
	message = 2,
}
