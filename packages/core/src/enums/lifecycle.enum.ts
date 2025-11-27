/**
 * Service lifecycle management enumeration.
 *
 * @overview
 * Defines how service instances are created and managed by the container.
 * The lifecycle determines whether a new instance is created for each resolution
 * or if instances are reused within specific scopes.
 *
 * @author AEPKILL
 * @created 2023-05-24 10:39:21
 */
export enum LifecycleEnum {
	/**
	 * Transient lifecycle - the default lifecycle type.
	 *
	 * The container creates a new instance every time the service is resolved.
	 * No instance reuse occurs, ensuring each resolution gets a fresh instance.
	 */
	transient = 0,

	/**
	 * Singleton lifecycle.
	 *
	 * The container creates a new instance the first time the service is resolved,
	 * and then returns the same instance for all subsequent resolutions within
	 * the same container.
	 */
	singleton = 1,

	/**
	 * Resolution-scoped lifecycle.
	 *
	 * The container creates a new instance the first time the service is resolved
	 * within a resolution context, and then returns the same instance for all
	 * subsequent resolutions within the same resolution context. This allows
	 * multiple services to share the same instance during a single resolution chain.
	 */
	resolution = 2,
}
