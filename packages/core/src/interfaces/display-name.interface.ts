/**
 * Display name interface.
 *
 * @overview
 * Defines a contract for objects that have a human-readable display name.
 * Used for debugging, logging, and error messages to provide meaningful
 * identification of containers, registrations, and other objects.
 *
 * @author AEPKILL
 * @created 2025-07-27 00:10:59
 */

/**
 * Interface for objects with a display name.
 *
 * @remarks
 * The display name is used in error messages, logs, and debugging output
 * to provide human-readable identification of objects in the dependency
 * injection system.
 */
export interface IDisplayName {
	/** The human-readable display name for the object. */
	readonly displayName: string;
}
