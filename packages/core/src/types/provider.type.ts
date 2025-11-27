/**
 * Provider type definitions for service registration.
 *
 * @overview
 * Defines the different provider types that can be used to register services
 * with the container. Each provider type represents a different strategy for
 * creating or providing service instances.
 *
 * @author AEPKILL
 * @created 2025-07-23 19:59:55
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { Constructor } from "@/types/constructor.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Base provider type with lifecycle configuration.
 *
 * @typeParam T - The service type provided
 */
export type ProviderBase = {
	/** The lifecycle strategy for the service instance. */
	readonly lifecycle: LifecycleEnum;
};

/**
 * Class-based provider.
 * Uses a constructor function to create service instances.
 *
 * @typeParam T - The service type provided
 */
export type ClassProvider<T> = ProviderBase & {
	/** The constructor function to instantiate the service. */
	readonly useClass: Constructor<T>;
};

/**
 * Value-based provider.
 * Uses a pre-created value as the service instance.
 *
 * @typeParam T - The service type provided
 */
export type ValueProvider<T> = ProviderBase & {
	/** The pre-created value to use as the service instance. */
	readonly useValue: T;
};

/**
 * Factory-based provider.
 * Uses a factory function to create service instances on demand.
 *
 * @typeParam T - The service type provided
 */
export type FactoryProvider<T> = ProviderBase & {
	/** The factory function that creates the service instance. */
	readonly useFactory: () => T;
};

/**
 * Alias-based provider.
 * References another service identifier, optionally from a different container.
 *
 * @typeParam T - The service type provided
 */
export type AliasProvider<T> = ProviderBase & {
	/** The service identifier to alias. */
	readonly useAlias: ServiceIdentifier<T>;
	/** Optional container to resolve the alias from. If not specified, uses the current container. */
	readonly container?: IContainer;
};

/**
 * Union type of all provider types.
 *
 * @typeParam T - The service type provided
 */
export type Provider<T> =
	| ClassProvider<T>
	| ValueProvider<T>
	| FactoryProvider<T>
	| AliasProvider<T>;
