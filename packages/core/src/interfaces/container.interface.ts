/**
 * Container interface definitions and type utilities.
 *
 * @remarks
 * This module defines the core container interfaces following the
 * Interface Segregation Principle (ISP) from SOLID principles.
 * The main {@link IContainer} interface is composed of smaller,
 * focused interfaces that each handle a specific aspect of container
 * functionality.
 *
 * @author AEPKILL
 * @created 2025-06-25 23:27:49
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: Generic type utilities require any type */

import type { IDisplayName } from "@/interfaces/display-name.interface";
import type { IDisposable } from "@/interfaces/disposable.interface";
import type {
	Middleware,
	MiddlewareExecutor,
} from "@/interfaces/middleware-chain.interface";
import type {
	CreateRegistrationOptions,
	IRegistration,
} from "@/interfaces/registration.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import type { IUnique } from "@/interfaces/unique.interface";
import type { MutableRef, Ref } from "@/types/ref.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Options for resolving service instances from the container.
 *
 * @remarks
 * Type-safe resolve options with the following constraints:
 * - `defaultValue` is only allowed when `optional` is true
 * - When `multiple` is true, `defaultValue` must be an array of T
 * - When `multiple` is false, `defaultValue` must be a single T
 *
 * @typeParam T - The type of the service instance to resolve
 *
 * @example
 * ```typescript
 * // Resolve a single required service
 * container.resolve(MyService);
 *
 * // Resolve an optional service with default value
 * container.resolve(MyService, { optional: true, defaultValue: new MyService() });
 *
 * // Resolve multiple services
 * container.resolve(MyService, { multiple: true });
 *
 * // Resolve as a reference
 * container.resolve(MyService, { ref: true });
 * ```
 */
export type ResolveOptions<T> = {
	/**
	 * Whether to return a dynamic reference that re-resolves on each access.
	 *
	 * @remarks
	 * **Warning**: Avoid using this option unless absolutely necessary.
	 * Setting this option creates an `InstanceDynamicRef` instance that maintains
	 * a closure over the resolve record and context, which may lead to memory leaks
	 * as these references are never released.
	 *
	 * @default false
	 */
	dynamic?: boolean;

	/**
	 * Whether to return a reference wrapper instead of the instance itself.
	 *
	 * @remarks
	 * When true, returns a `Ref<T>` that allows lazy access to the service instance.
	 * Useful for breaking circular dependencies or deferring resolution.
	 *
	 * @default false
	 */
	ref?: boolean;
} & ( // Single required service without default value
	| {
			multiple?: false;
			optional?: false;
			defaultValue?: never;
	  }
	// Single optional service with possible default value
	| {
			multiple?: false;
			optional: true;
			defaultValue?: T;
	  }
	// Multiple required services without default value
	| {
			multiple: true;
			optional?: false;
			defaultValue?: never;
	  }
	// Multiple optional services with possible default array
	| {
			multiple: true;
			optional: true;
			defaultValue?: T[];
	  }
);

/**
 * Determines whether the resolved type should be an array based on resolve options.
 *
 * @typeParam T - The service instance type
 * @typeParam O - The resolve options type
 *
 * @internal
 */
type ResolveArrayType<T, O extends ResolveOptions<T>> = O extends {
	multiple: true;
}
	? T[]
	: T;

/**
 * Determines whether the resolved type should be optional (possibly undefined).
 *
 * @remarks
 * Returns `T | undefined` when options specify `optional: true` without a default value,
 * otherwise returns `T` directly.
 *
 * @typeParam T - The service instance type (may be an array if multiple: true)
 * @typeParam O - The resolve options type
 *
 * @internal
 */
type ResolveOptionalType<T, O extends ResolveOptions<T>> = O extends {
	optional: true;
	defaultValue?: undefined;
}
	? ResolveArrayType<T, O> | undefined
	: ResolveArrayType<T, O>;

/**
 * Determines whether the resolved type should be wrapped in a Ref.
 *
 * @remarks
 * Returns `Ref<T>` when options specify `ref: true` or `dynamic: true`,
 * otherwise returns `T` directly.
 *
 * @typeParam T - The service instance type
 * @typeParam O - The resolve options type
 *
 * @internal
 */
type ResolveRefType<T, O extends ResolveOptions<any>> = O extends
	| { ref: true }
	| { dynamic: true }
	? Ref<T>
	: T;

/**
 * Infers the final resolved type based on the provided resolve options.
 *
 * @remarks
 * This type applies multiple transformations in order:
 * 1. Wraps in array if `multiple: true`
 * 2. Makes optional if `optional: true` without default value
 * 3. Wraps in `Ref` if `ref: true` or `dynamic: true`
 *
 * @typeParam T - The base service instance type
 * @typeParam O - The resolve options type
 *
 * @example
 * ```typescript
 * // Single instance: MyService
 * type A = ResolveInstance<MyService, { multiple: false }>;
 *
 * // Multiple instances: MyService[]
 * type B = ResolveInstance<MyService, { multiple: true }>;
 *
 * // Optional single: MyService | undefined
 * type C = ResolveInstance<MyService, { optional: true }>;
 *
 * // Ref-wrapped: Ref<MyService>
 * type D = ResolveInstance<MyService, { ref: true }>;
 * ```
 */
export type ResolveInstance<T, O extends ResolveOptions<any>> = ResolveRefType<
	ResolveOptionalType<T, O>,
	O
>;

/**
 * Parameters passed to resolve middleware during service resolution.
 *
 * @remarks
 * This type contains all the context information available during the
 * resolution process, allowing middleware to inspect and potentially
 * modify the resolution behavior.
 *
 * @typeParam T - The service instance type being resolved
 * @typeParam O - The resolve options type
 */
export type ResolveMiddlewareParams<T, O extends ResolveOptions<T>> = {
	/** The identifier of the service being resolved */
	serviceIdentifier: ServiceIdentifier<T>;

	/** The options used for this resolution */
	resolveOptions: O;

	/** The container performing the resolution */
	container: IContainer;

	/** Internal resolve record tracking the resolution chain */
	resolveRecord: IInternalResolveRecord;

	/** The registration associated with this service */
	registration: IRegistration<T>;

	/** The current resolution context */
	resolveContext: ResolveContext;
};

/**
 * Executor function type for resolve middleware.
 *
 * @remarks
 * This executor is responsible for continuing the middleware chain
 * and eventually returning the resolved service instance.
 *
 * @typeParam T - The service instance type being resolved
 * @typeParam O - The resolve options type
 */
export type ResolveMiddlewareExecutor<
	T,
	O extends ResolveOptions<T>,
> = MiddlewareExecutor<ResolveMiddlewareParams<T, O>, T>;

/**
 * Middleware function type for intercepting service resolution.
 *
 * @remarks
 * Resolve middleware allows you to intercept and customize the service
 * resolution process. Middleware can:
 * - Inspect resolution parameters
 * - Modify the resolved instance
 * - Perform side effects (logging, caching, etc.)
 * - Short-circuit resolution by not calling next()
 *
 * @typeParam T - The service instance type being resolved
 * @typeParam O - The resolve options type
 *
 * @example
 * ```typescript
 * // Logging middleware
 * const loggingMiddleware: ResolveMiddleware<any, any> = async (params, next) => {
 *   console.log(`Resolving ${params.serviceIdentifier}`);
 *   const result = await next();
 *   console.log(`Resolved ${params.serviceIdentifier}`);
 *   return result;
 * };
 *
 * container.use(loggingMiddleware);
 * ```
 */
export type ResolveMiddleware<T, O extends ResolveOptions<T>> = Middleware<
	ResolveMiddlewareParams<T, O>,
	ResolveInstance<T, O>
>;

/**
 * Options for checking service registration status.
 */
export type IsRegisteredOptions = {
	/**
	 * Whether to check recursively in the parent container hierarchy.
	 *
	 * @remarks
	 * When true, searches for the service in the current container and
	 * all ancestor containers. When false, only checks the current container.
	 *
	 * @default false
	 */
	recursive?: boolean;
};

/**
 * Service resolver interface.
 *
 * @remarks
 * Responsible for resolving service instances from the container.
 * This interface provides the core functionality for retrieving
 * registered services with various resolution options.
 *
 * @see {@link IServiceRegistry} for service registration
 * @see {@link ResolveOptions} for available resolution options
 */
export interface IServiceResolver {
	/**
	 * Resolves a required service instance by its identifier.
	 *
	 * @typeParam T - The type of the service to resolve
	 * @param serviceIdentifier - The identifier of the service to resolve
	 * @returns The resolved service instance
	 * @throws {ResolveException} When the service cannot be resolved
	 *
	 * @example
	 * ```typescript
	 * const service = container.resolve(MyService);
	 * ```
	 */
	resolve<T>(serviceIdentifier: ServiceIdentifier<T>): T;

	/**
	 * Resolves a service instance with additional options.
	 *
	 * @remarks
	 * This overload provides fine-grained control over the resolution process,
	 * allowing you to specify whether the service is optional, whether to resolve
	 * multiple instances, and whether to return a reference wrapper.
	 *
	 * @typeParam T - The type of the service to resolve
	 * @typeParam O - The type of resolve options
	 * @param serviceIdentifier - The identifier of the service to resolve
	 * @param options - Resolve options including multiple, optional, ref, etc.
	 * @returns The resolved service instance(s), typed according to the options
	 * @throws {ResolveException} When the service cannot be resolved and is not optional
	 *
	 * @example
	 * ```typescript
	 * // Resolve optional service
	 * const service = container.resolve(MyService, { optional: true });
	 *
	 * // Resolve multiple services
	 * const services = container.resolve(MyService, { multiple: true });
	 *
	 * // Resolve as reference
	 * const ref = container.resolve(MyService, { ref: true });
	 * const service = ref.value;
	 * ```
	 */
	resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: O,
	): ResolveInstance<T, O>;
}

/**
 * Service registry interface.
 *
 * @remarks
 * Responsible for managing service registrations in the container.
 * This interface provides methods for registering, unregistering,
 * and querying service registrations.
 *
 * @see {@link IServiceResolver} for service resolution
 * @see {@link CreateRegistrationOptions} for registration options
 */
export interface IServiceRegistry {
	/**
	 * Registers a service with the container.
	 *
	 * @remarks
	 * Associates a service identifier with a registration strategy
	 * (constructor, factory, or instance) and lifecycle management options.
	 * If a service with the same identifier is already registered, it will
	 * be replaced.
	 *
	 * @typeParam T - The type of the service to register
	 * @param serviceIdentifier - The identifier of the service to register
	 * @param registration - The registration options defining how to create the service
	 *
	 * @example
	 * ```typescript
	 * // Register a class
	 * container.register(MyService, { useClass: MyService });
	 *
	 * // Register a factory
	 * container.register(MyService, { useFactory: () => new MyService() });
	 *
	 * // Register an instance
	 * container.register(MyService, { useValue: new MyService() });
	 * ```
	 */
	register<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: CreateRegistrationOptions<T>,
	): void;

	/**
	 * Checks if a service is registered in the container.
	 *
	 * @remarks
	 * By default, only checks the current container. Set `recursive: true`
	 * to check parent containers as well.
	 *
	 * @typeParam T - The type of the service to check
	 * @param serviceIdentifier - The identifier of the service to check
	 * @param options - Check options including recursive search in parent containers
	 * @returns `true` if the service is registered, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * // Check in current container only
	 * if (container.isRegistered(MyService)) {
	 *   // Service is registered
	 * }
	 *
	 * // Check in current and parent containers
	 * if (container.isRegistered(MyService, { recursive: true })) {
	 *   // Service is registered somewhere in the hierarchy
	 * }
	 * ```
	 */
	isRegistered<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: IsRegisteredOptions,
	): boolean;

	/**
	 * Unregisters a service from the container.
	 *
	 * @remarks
	 * Removes the registration associated with the given service identifier.
	 * If the service is not registered, this method does nothing.
	 * Note: This does not affect already resolved instances.
	 *
	 * @typeParam T - The type of the service to unregister
	 * @param serviceIdentifier - The identifier of the service to unregister
	 *
	 * @example
	 * ```typescript
	 * container.unregister(MyService);
	 * ```
	 */
	unregister<T>(serviceIdentifier: ServiceIdentifier<T>): void;

	/**
	 * Gets all registered service identifiers in the container.
	 *
	 * @remarks
	 * Returns an array of all service identifiers that are currently
	 * registered in this container. Does not include services registered
	 * in parent containers.
	 *
	 * @returns An array of all service identifiers registered in this container
	 *
	 * @example
	 * ```typescript
	 * const identifiers = container.getServiceIdentifiers();
	 * console.log(`Container has ${identifiers.length} services registered`);
	 * ```
	 */
	getServiceIdentifiers(): ServiceIdentifier<unknown>[];
}

/**
 * Middleware manager interface.
 *
 * @remarks
 * Responsible for managing resolve middleware that intercepts and
 * customizes the service resolution process. Middleware can be used
 * for cross-cutting concerns such as logging, caching, validation,
 * and performance monitoring.
 *
 * @see {@link ResolveMiddleware} for middleware function type
 */
export interface IMiddlewareManager {
	/**
	 * Registers a middleware to the container.
	 *
	 * @remarks
	 * Adds a middleware function to the resolution pipeline. Middleware
	 * will be executed in the order they are registered (FIFO).
	 * The same middleware instance can be registered multiple times.
	 *
	 * @param middleware - The middleware function to register
	 *
	 * @example
	 * ```typescript
	 * // Add logging middleware
	 * container.use(async (params, next) => {
	 *   console.log(`Resolving: ${params.serviceIdentifier}`);
	 *   const result = await next();
	 *   console.log(`Resolved: ${params.serviceIdentifier}`);
	 *   return result;
	 * });
	 * ```
	 */
	use(middleware: ResolveMiddleware<any, any>): void;

	/**
	 * Unregisters a middleware from the container.
	 *
	 * @remarks
	 * Removes a previously registered middleware function from the
	 * resolution pipeline. If the middleware was registered multiple times,
	 * only the first occurrence is removed.
	 * If the middleware is not found, this method does nothing.
	 *
	 * @param middleware - The middleware function to unregister
	 *
	 * @example
	 * ```typescript
	 * const loggingMiddleware = async (params, next) => {
	 *   console.log(`Resolving: ${params.serviceIdentifier}`);
	 *   return await next();
	 * };
	 *
	 * container.use(loggingMiddleware);
	 * // Later...
	 * container.unused(loggingMiddleware);
	 * ```
	 */
	unused(middleware: ResolveMiddleware<any, any>): void;
}

/**
 * Container hierarchy interface.
 *
 * @remarks
 * Responsible for managing container parent-child relationships.
 * Containers can form a hierarchy where child containers can access
 * services registered in their parent containers, enabling service
 * scoping and inheritance.
 *
 * @see {@link IContainer} for the main container interface
 */
export interface IContainerHierarchy {
	/**
	 * The name of the container.
	 *
	 * @remarks
	 * Used for identification and debugging purposes. Names should be
	 * unique within a container hierarchy but this is not enforced.
	 */
	readonly name: string;

	/**
	 * The parent container in the hierarchy.
	 *
	 * @remarks
	 * If set, this container will attempt to resolve services from
	 * the parent container when they are not found locally.
	 * Root containers have no parent (undefined).
	 *
	 * @example
	 * ```typescript
	 * const rootContainer = createContainer("root");
	 * const childContainer = createContainer("child", rootContainer);
	 * console.log(childContainer.parent === rootContainer); // true
	 * ```
	 */
	readonly parent?: IContainer;
}

/**
 * Main container interface.
 *
 * @remarks
 * The central interface for dependency injection, combining all container
 * capabilities following the Interface Segregation Principle (ISP).
 * This interface provides:
 * - Service resolution ({@link IServiceResolver})
 * - Service registration management ({@link IServiceRegistry})
 * - Middleware management ({@link IMiddlewareManager})
 * - Hierarchical container relationships ({@link IContainerHierarchy})
 * - Unique identification ({@link IUnique})
 * - Resource disposal ({@link IDisposable})
 * - Display name customization ({@link IDisplayName})
 *
 * @example
 * ```typescript
 * // Create a container
 * const container = createContainer("app");
 *
 * // Register services
 * container.register(MyService, { useClass: MyService });
 * container.register(Config, { useValue: { apiUrl: "..." } });
 *
 * // Resolve services
 * const service = container.resolve(MyService);
 *
 * // Add middleware
 * container.use(loggingMiddleware);
 *
 * // Create child container
 * const childContainer = createContainer("child", container);
 *
 * // Dispose when done
 * await container.dispose();
 * ```
 */
export interface IContainer
	extends IUnique,
		IDisposable,
		IDisplayName,
		IServiceResolver,
		IServiceRegistry,
		IMiddlewareManager,
		IContainerHierarchy {}

/**
 * Internal container interface with additional internal state.
 *
 * @remarks
 * This interface extends {@link IContainer} with internal implementation
 * details that should not be exposed to public API consumers.
 * Used internally by the framework for managing resolution context.
 *
 * @internal
 */
export interface IInternalContainer extends IContainer {
	/**
	 * Mutable reference to the current resolution context.
	 *
	 * @remarks
	 * This reference is used internally to track the current resolution
	 * context during the resolution process. It should not be accessed
	 * or modified by external code.
	 *
	 * @internal
	 */
	readonly _internalResolveContextRef: MutableRef<ResolveContext>;
}
