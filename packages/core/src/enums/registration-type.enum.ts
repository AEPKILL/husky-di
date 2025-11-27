/**
 * Service registration type enumeration.
 *
 * @overview
 * Defines the different ways a service can be registered with the container.
 * Each type represents a different provider strategy for creating service instances.
 *
 * @author AEPKILL
 * @created 2025-07-27 22:47:00
 */
export enum RegistrationTypeEnum {
	/** Register a service using a class constructor. */
	class = "class",

	/** Register a service using a factory function. */
	factory = "factory",

	/** Register a service using a pre-created value. */
	value = "value",

	/** Register a service as an alias to another service identifier. */
	alias = "alias",
}
