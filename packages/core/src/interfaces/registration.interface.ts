/**
 * Registration interface and type definitions.
 *
 * @overview
 * Defines the registration system for services in the dependency injection
 * container. Registrations specify how services are created and managed,
 * including lifecycle, provider type, and resolution options.
 *
 * @author AEPKILL
 * @created 2025-07-27 22:55:05
 */

import type { LifecycleEnum } from "@/enums/lifecycle.enum";
import type { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import type { Constructor } from "@/types/constructor.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IContainer } from "./container.interface";
import type { IUnique } from "./unique.interface";

/**
 * Base options for creating registrations.
 */
export type CreateRegistrationBaseOptions = {
	/** The lifecycle strategy for the service (defaults to transient) */
	readonly lifecycle?: LifecycleEnum;
};

/**
 * Options passed to factory functions during resolution.
 */
export type RegistrationResolveOptions = {
	/** The container performing the resolution */
	readonly container: IContainer;
	/** The current resolution context */
	readonly resolveContext: ResolveContext;
};

/**
 * Options for class-based registration.
 *
 * @typeParam T - The service type
 */
export type CreateClassRegistrationOptions<T> = {
	/** The constructor function to use for creating instances */
	readonly useClass: Constructor<T>;
} & CreateRegistrationBaseOptions;

/**
 * Options for factory-based registration.
 *
 * @typeParam T - The service type
 */
export type CreateFactoryRegistrationOptions<T> = {
	/** The factory function to use for creating instances */
	readonly useFactory: (
		container: IContainer,
		resolveContext: ResolveContext,
	) => T;
} & CreateRegistrationBaseOptions;

/**
 * Options for value-based registration.
 *
 * @typeParam T - The service type
 */
export type CreateValueRegistrationOptions<T> = {
	/** The pre-created value to use as the service instance */
	readonly useValue: T;
} & CreateRegistrationBaseOptions;

/**
 * Options for alias-based registration.
 *
 * @typeParam T - The service type
 */
export type CreateAliasRegistrationOptions<T> = {
	/** The service identifier to alias */
	readonly useAlias: ServiceIdentifier<T>;
	/** Optional function to get the container for resolving the alias */
	readonly getContainer?: () => IContainer;
};

/**
 * Union type of all registration creation options.
 *
 * @typeParam T - The service type
 */
export type CreateRegistrationOptions<T> =
	| CreateClassRegistrationOptions<T>
	| CreateFactoryRegistrationOptions<T>
	| CreateValueRegistrationOptions<T>
	| CreateAliasRegistrationOptions<T>;

/**
 * Registration interface for service registrations.
 *
 * @typeParam T - The service type
 *
 * @remarks
 * A registration represents a service that has been registered with the
 * container. It tracks the registration type, lifecycle, provider, and
 * the resolved instance (if any).
 */
export interface IRegistration<T> extends IUnique {
	/** The type of registration (class, factory, value, or alias) */
	readonly type: RegistrationTypeEnum;
	/** The lifecycle strategy for the service */
	readonly lifecycle: LifecycleEnum;
	/** The resolved instance, if the service has been resolved */
	readonly instance: T | undefined;
	/** Whether the service has been resolved */
	readonly resolved: boolean;
	/** The provider used to create instances */
	readonly provider:
		| CreateClassRegistrationOptions<T>["useClass"]
		| CreateFactoryRegistrationOptions<T>["useFactory"]
		| CreateValueRegistrationOptions<T>["useValue"]
		| CreateAliasRegistrationOptions<T>["useAlias"];

	/** Optional function to get the container for alias registrations */
	readonly getContainer?: () => IContainer;
}

/**
 * Internal registration interface with additional internal methods.
 *
 * @typeParam T - The service type
 *
 * @remarks
 * Extends IRegistration with internal methods for managing resolution state.
 * These methods are used internally by the container implementation and
 * should not be called by external code.
 *
 * @internal
 */
export interface IInternalRegistration<T> extends IRegistration<T> {
	/**
	 * Sets the resolved state of the registration.
	 *
	 * @internal
	 * @param resolved - Whether the registration has been resolved
	 */
	_internalSetResolved(resolved: boolean): void;

	/**
	 * Sets the resolved instance.
	 *
	 * @internal
	 * @param instance - The resolved instance
	 */
	_internalSetInstance(instance: T): void;
}
