/**
 * @overview Container Implementation
 * @description Core dependency injection container implementation that provides service registration, resolution, and lifecycle management
 * @author AEPKILL
 * @created 2025-07-29 22:30:35
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: Required for flexible middleware and registration system */

import { INTERNAL_SERVICES } from "@/constants/internal-service.const";
import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import { CodedException } from "@/exceptions/coded.exception";
import { ResolveException } from "@/exceptions/resolve.exception";
import { DisposableRegistryImpl } from "@/impls/DisposableRegistryImpl";
import { InstanceDynamicRefImpl } from "@/impls/InstanceDynamicRefImpl";
import { InstanceRefImpl } from "@/impls/InstanceRefImpl";
import { MiddlewareChainImpl } from "@/impls/MiddlewareChainImpl";
import { RegistrationImpl } from "@/impls/RegistrationImpl";
import { RegistryImpl } from "@/impls/RegistryImpl";
import type {
	IContainer,
	IInternalContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddleware,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { IDisposableRegistry } from "@/interfaces/disposable-registry.interface";
import type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
	IInternalRegistration,
} from "@/interfaces/registration.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import { globalMiddleware } from "@/shared/instances";
import type { Constructor } from "@/types/constructor.type";
import type { MutableRef, Ref } from "@/types/ref.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { createAssertNotDisposed } from "@/utils/disposable.utils";
import {
	getEnsureResolveRecord,
	resetResolveRecord,
	setResolveRecord,
} from "@/utils/resolve-record.utils";
import { getServiceIdentifierName } from "@/utils/service-identifier.utils";
import { createContainerId } from "@/utils/uuid.utils";

const assertNotDisposed = createAssertNotDisposed("Container");

/**
 * Dependency Injection Container Implementation
 *
 * This class provides comprehensive service registration, resolution, and lifecycle management
 * for dependency injection. It supports multiple lifecycle strategies (singleton, transient, resolution),
 * middleware chains for custom resolution logic, and hierarchical container relationships.
 *
 * @extends DisposableRegistryImpl - Provides automatic cleanup of resources
 * @implements IInternalContainer - Internal container interface with enhanced capabilities
 */
export class ContainerImpl implements IInternalContainer {
	private _disposableRegistry: IDisposableRegistry =
		new DisposableRegistryImpl();

	/**
	 * Unique identifier for this container instance
	 */
	public readonly id: string;

	/**
	 * Human-readable name of the container
	 */
	public get name(): string {
		return this._name;
	}

	/**
	 * Display name combining name and ID for debugging purposes
	 */
	public get displayName(): string {
		return `${this.name}/${this.id}`;
	}

	/**
	 * Parent container for hierarchical resolution
	 */
	public get parent(): IContainer | undefined {
		return this._parent;
	}

	/**
	 * Internal reference to the current resolve context
	 * @internal
	 */
	public get _internalResolveContextRef(): MutableRef<ResolveContext> {
		return this._resolveContextRef;
	}

	public get disposed() {
		return this._disposableRegistry.disposed;
	}

	/**
	 * Registry storing all service registrations
	 */
	private readonly _registry: RegistryImpl;

	/**
	 * Parent container for cascading service resolution
	 */
	private readonly _parent?: IContainer;

	/**
	 * Container name for identification and debugging
	 */
	private readonly _name: string;

	/**
	 * Mutable reference to the current resolution context
	 */
	private readonly _resolveContextRef: MutableRef<ResolveContext>;

	/**
	 * Middleware chain for intercepting and customizing service resolution
	 */
	private readonly _resolveMiddlewareChain: MiddlewareChainImpl<
		ResolveMiddlewareParams<unknown, ResolveOptions<unknown>>,
		any
	>;

	/**
	 * Creates a new dependency injection container
	 *
	 * @param name - Human-readable name for the container, used for debugging and error messages
	 * @param parent - Optional parent container for hierarchical service resolution
	 */
	constructor(name: string = "AnonymousContainer", parent?: IContainer) {
		this.id = createContainerId();
		this._name = name;
		this._registry = new RegistryImpl();
		this._parent = parent;

		// Initialize middleware chain with global middleware and resolution handler
		this._resolveMiddlewareChain = new MiddlewareChainImpl(
			(params) => {
				return this._resolveRegistration(params);
			},
			globalMiddleware,
			[],
		);

		// Register internal service
		for (const internalService of INTERNAL_SERVICES) {
			this.register(
				internalService.serviceIdentifier,
				internalService.registrationOptions,
			);
		}

		this._resolveContextRef = { current: undefined };

		this._disposableRegistry.addCleanup(() => {
			for (const middleware of [
				...globalMiddleware.middlewares,
				...this._resolveMiddlewareChain.middlewares,
			]) {
				try {
					middleware.onContainerDispose?.(this);
				} catch {
					// Ignore errors during cleanup
				}
			}
		});

		// Register cleanup handlers for proper disposal
		this._disposableRegistry.addDisposable(this._resolveMiddlewareChain);
		this._disposableRegistry.addCleanup(() => {
			this._registry.clear();
		});
	}

	/**
	 * Resolves a service instance from the container
	 *
	 * This is the primary method for retrieving service instances. It supports various resolution
	 * strategies including singleton, transient, and resolution-scoped lifecycles. It also handles
	 * circular dependency detection, parent container fallback, and automatic class instantiation.
	 *
	 * @template T - The type of the service to resolve
	 * @template O - The type of resolve options extending ResolveOptions<T>
	 * @param serviceIdentifier - The unique identifier for the service (symbol, string, or class constructor)
	 * @param options - Optional configuration for resolution behavior:
	 *   - `ref`: Returns a reference that lazily resolves on first access (breaks circular dependencies)
	 *   - `dynamic`: Returns a dynamic reference that re-resolves on each access
	 *   - `multiple`: Returns all registered instances for this identifier
	 *   - `optional`: Returns undefined instead of throwing if service not found
	 *   - `defaultValue`: Default value to return when service is optional and not found
	 * @returns The resolved service instance, reference, or array based on options
	 * @throws {ResolveException} If service is not registered and not optional, or if circular dependency detected
	 */
	public resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: O,
	): ResolveInstance<T, O> {
		assertNotDisposed(this);

		const resolveOptions = options || ({} as ResolveOptions<T>);
		const { defaultValue, dynamic, ref, multiple, optional } = resolveOptions;
		const resolveRecord = getEnsureResolveRecord(this);

		if (dynamic && ref) {
			throw new ResolveException(
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
				`Cannot use both "dynamic" and "ref" options simultaneously for service identifier "${getServiceIdentifierName(serviceIdentifier)}". These options are mutually exclusive. Please choose either "dynamic" or "ref", but not both.`,
				resolveRecord,
			);
		}
		if ("defaultValue" in resolveOptions && optional !== true) {
			throw new ResolveException(
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
				`Cannot specify "defaultValue" without setting "optional" to true for service identifier "${getServiceIdentifierName(serviceIdentifier)}".`,
				resolveRecord,
			);
		}
		if (
			"defaultValue" in resolveOptions &&
			multiple &&
			!Array.isArray(defaultValue)
		) {
			throw new ResolveException(
				CoreErrorCodeEnum.E_INVALID_OPTIONS,
				`When "multiple" is true, "defaultValue" must be an array for service identifier "${getServiceIdentifierName(serviceIdentifier)}".`,
				resolveRecord,
			);
		}

		const resolveContext = this._getResolveContext();
		const registrations = this._registry.getAll(serviceIdentifier);
		const isRootResolveRecord =
			resolveRecord.current.value.type === ResolveRecordTypeEnum.root;

		try {
			return this._withResolveRecord(serviceIdentifier, resolveRecord, () => {
				// Record the resolution attempt for debugging and error reporting
				if (multiple) {
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a multiple instance`,
					});
				} else {
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.serviceIdentifier,
						resolveOptions,
						serviceIdentifier,
						container: this,
					});
				}

				if (ref) {
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: `Service Identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a ref, wait for use.`,
					});
					return this._createRefInstance(
						serviceIdentifier,
						resolveOptions,
						resolveRecord,
						InstanceRefImpl,
						"ref",
					);
				}

				if (dynamic) {
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: `Service Identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a dynamic ref, wait for use.`,
					});
					return this._createRefInstance(
						serviceIdentifier,
						resolveOptions,
						resolveRecord,
						InstanceDynamicRefImpl,
						"dynamic",
					);
				}

				const cycleNodeInfo = resolveRecord.getCycleNodeInfo();
				if (cycleNodeInfo) {
					throw new ResolveException(
						CoreErrorCodeEnum.E_CIRCULAR_DEPENDENCY,
						`Circular dependency detected for service identifier "${getServiceIdentifierName(serviceIdentifier)}". To resolve this, use either the "ref" option to get a reference to the service or the "dynamic" option to defer resolution until the service is actually used.`,
						resolveRecord,
					);
				}

				if (registrations.length === 0) {
					return this._handleUnregisteredService(
						serviceIdentifier,
						resolveOptions,
						resolveRecord,
						resolveContext,
					);
				}

				if (multiple) {
					const instances = registrations.map((registration, index) =>
						this._withResolveRecord(serviceIdentifier, resolveRecord, () => {
							resolveRecord.addRecordNode({
								type: ResolveRecordTypeEnum.message,
								message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is resolved as a multiple instance, resolve instance #${index}`,
							});

							return this._resolveInternal({
								container: this,
								serviceIdentifier,
								resolveOptions,
								registration,
								resolveContext,
								resolveRecord,
							});
						}),
					);

					return instances as ResolveInstance<T, O>;
				} else {
					return this._resolveInternal({
						container: this,
						serviceIdentifier,
						resolveOptions,
						registration: registrations[registrations.length - 1],
						resolveContext,
						resolveRecord,
					}) as ResolveInstance<T, O>;
				}
			}) as ResolveInstance<T, O>;
		} finally {
			if (isRootResolveRecord) {
				resetResolveRecord();
				this._resolveContextRef.current = undefined;
			}
		}
	}

	/**
	 * Registers a service in the container
	 *
	 * Services can be registered using various strategies:
	 * - Class: Automatically instantiated when resolved
	 * - Value: Returns the exact value provided
	 * - Factory: Executes a factory function to create the instance
	 * - Alias: Redirects to another service identifier
	 *
	 * @template T - The type of the service being registered
	 * @param serviceIdentifier - Unique identifier for the service
	 * @param registration - Registration configuration specifying how to create the service
	 */
	public register<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: CreateRegistrationOptions<T>,
	): void {
		assertNotDisposed(this);

		const registrationInstance = new RegistrationImpl<T>(registration);
		this._registry.set(serviceIdentifier, registrationInstance);
	}

	/**
	 * Checks if a service is registered in the container
	 *
	 * @template T - The type of the service
	 * @param serviceIdentifier - The service identifier to check
	 * @param options - Configuration options:
	 *   - `recursive`: If true, also checks parent containers
	 * @returns True if the service is registered, false otherwise
	 */
	public isRegistered<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options?: IsRegisteredOptions,
	): boolean {
		assertNotDisposed(this);

		const { recursive = false } = options || {};

		if (this._registry.has(serviceIdentifier)) {
			return true;
		}

		if (recursive && this._parent) {
			return this._parent.isRegistered(serviceIdentifier, options);
		}

		return false;
	}

	/**
	 * Unregisters a service from the container
	 *
	 * Removes the service registration, making it unavailable for future resolutions.
	 * Note: This does not dispose existing singleton instances.
	 *
	 * @template T - The type of the service
	 * @param serviceIdentifier - The service identifier to unregister
	 */
	public unregister<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		assertNotDisposed(this);

		this._registry.remove(serviceIdentifier);
	}

	/**
	 * Adds a middleware to the resolution chain
	 *
	 * Middleware can intercept and modify service resolution, enabling features like
	 * logging, validation, caching, and custom instantiation logic.
	 *
	 * @param middleware - The middleware function to add to the resolution chain
	 */
	public use(middleware: ResolveMiddleware<any, any>): void {
		assertNotDisposed(this);

		this._resolveMiddlewareChain.use(middleware);
	}

	/**
	 * Removes a middleware from the resolution chain
	 *
	 * @param middleware - The middleware function to remove
	 */
	public unused(middleware: ResolveMiddleware<any, any>): void {
		assertNotDisposed(this);

		this._resolveMiddlewareChain.unused(middleware);
	}

	/**
	 * Retrieves all registered service identifiers
	 *
	 * @returns An array of all service identifiers currently registered in this container
	 */
	public getServiceIdentifiers(): ServiceIdentifier<unknown>[] {
		return this._registry.keys();
	}

	public dispose(): void {
		this._disposableRegistry.dispose();
	}

	/**
	 * Internal resolution method that handles lifecycle management
	 *
	 * This method implements the core resolution logic with lifecycle-aware caching:
	 * - Singleton: Creates once and caches forever
	 * - Resolution: Creates once per resolution tree and caches in resolve context
	 * - Transient: Always creates a new instance
	 *
	 * @template T - The type of the service
	 * @template O - The resolve options type
	 * @param params - Resolution parameters including container, service identifier, and registration
	 * @returns The resolved service instance or reference
	 */
	private _resolveInternal<T, O extends ResolveOptions<T>>(
		params: ResolveMiddlewareParams<T, O>,
	): T | Ref<T> {
		const { registration, resolveContext } = params;

		// Check singleton cache first
		const isSingleton = registration.lifecycle === LifecycleEnum.singleton;
		if (isSingleton) {
			if (registration.resolved) {
				return registration.instance as T;
			}
		}

		// Check resolution-scoped cache
		const isResolution = registration.lifecycle === LifecycleEnum.resolution;
		if (isResolution) {
			if (resolveContext.has(registration)) {
				return resolveContext.get(registration) as T;
			}
		}

		// Execute middleware chain to create the instance
		const instance = this._resolveMiddlewareChain.execute(params);

		// Cache the instance according to its lifecycle
		if (isSingleton) {
			(registration as IInternalRegistration<T>)._internalSetInstance(instance);
			(registration as IInternalRegistration<T>)._internalSetResolved(true);
		} else if (isResolution) {
			resolveContext.set(registration, instance);
		}

		return instance;
	}

	/**
	 * Resolves a service based on its registration type
	 *
	 * This method handles different registration strategies:
	 * - Class: Instantiates the class constructor
	 * - Value: Returns the pre-configured value
	 * - Factory: Invokes the factory function with container and context
	 * - Alias: Delegates to another service identifier
	 *
	 * @template T - The type of the service
	 * @template O - The resolve options type
	 * @param params - Resolution parameters containing registration and context information
	 * @returns The resolved service instance
	 * @throws {Error} If the registration type is not supported
	 */
	private _resolveRegistration<T, O extends ResolveOptions<T>>(
		params: ResolveMiddlewareParams<T, O>,
	): T {
		const {
			serviceIdentifier,
			resolveOptions,
			resolveRecord,
			registration,
			container,
			resolveContext,
		} = params;

		const identifierName = getServiceIdentifierName(serviceIdentifier);

		return this._withResolveRecord(serviceIdentifier, resolveRecord, () => {
			switch (registration.type) {
				case RegistrationTypeEnum.class: {
					const provider =
						registration.provider as CreateClassRegistrationOptions<T>["useClass"];
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: `Constructing class for "${identifierName}"`,
					});
					return new provider();
				}
				case RegistrationTypeEnum.value:
					return registration.provider as CreateValueRegistrationOptions<T>["useValue"];
				case RegistrationTypeEnum.factory: {
					const provider =
						registration.provider as CreateFactoryRegistrationOptions<T>["useFactory"];
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: `Invoking factory for "${identifierName}"`,
					});
					return provider(container, resolveContext);
				}
				case RegistrationTypeEnum.alias: {
					const provider =
						registration.provider as CreateAliasRegistrationOptions<T>["useAlias"];
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: registration.getContainer
							? `Resolving alias container for "${identifierName}"`
							: `Resolving alias "${identifierName}" via current container`,
					});
					const containerRef = registration.getContainer
						? registration.getContainer()
						: container;

					return containerRef.resolve(provider, resolveOptions) as T;
				}
				default:
					throw new ResolveException(
						CoreErrorCodeEnum.E_INVALID_PROVIDER,
						`Unsupported registration type: ${registration.type}`,
						params.resolveRecord,
					);
			}
		});
	}

	/**
	 * Wrapper function that manages resolve record lifecycle during resolution
	 *
	 * This method provides error handling and context management for resolution operations.
	 * It stashes the current resolve record state before the operation and restores it after,
	 * ensuring proper error tracking and circular dependency detection.
	 *
	 * @template T - The type of the service being resolved
	 * @param serviceIdentifier - The service identifier being resolved
	 * @param resolveRecord - The resolve record tracking the resolution chain
	 * @param operation - The resolution operation to execute
	 * @returns The result of the operation
	 * @throws {ResolveException} If the operation fails, wrapped with contextual information
	 */
	private _withResolveRecord<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		resolveRecord: IInternalResolveRecord,
		operation: () => T,
	): T {
		try {
			resolveRecord._internalStashCurrent();
			const instance = operation();
			resolveRecord._internalRestoreCurrent();
			return instance;
		} catch (error: unknown) {
			// Re-throw if already a ResolveException to preserve the original context
			if (ResolveException.isResolveException(error)) {
				throw error;
			}

			if (error instanceof CodedException) {
				throw new ResolveException(
					error.code as CoreErrorCodeEnum,
					error.detail,
					resolveRecord,
					error,
				);
			}

			// Wrap other errors with resolution context for better debugging
			throw new ResolveException(
				CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				`Failed to resolve service identifier "${getServiceIdentifierName(serviceIdentifier)}" in "${this.displayName}": ${error instanceof Error ? error.message : String(error)}`,
				resolveRecord,
				error,
			);
		}
	}

	/**
	 * Creates a reference instance for lazy or dynamic resolution
	 *
	 * References are used to break circular dependencies or defer resolution:
	 * - Ref: Lazy reference that resolves once on first access
	 * - DynamicRef: Re-resolves the service on each access
	 *
	 * @template T - The type of the service
	 * @template O - The resolve options type
	 * @param serviceIdentifier - The service identifier to wrap in a reference
	 * @param resolveOptions - Resolution options to use when the reference is accessed
	 * @param resolveRecord - The current resolve record for tracking
	 * @param RefClass - The reference class constructor (InstanceRefImpl or InstanceDynamicRefImpl)
	 * @param refType - The type of reference being created ("ref" or "dynamic")
	 * @returns A reference instance that will resolve the service when accessed
	 */
	private _createRefInstance<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		resolveOptions: O,
		resolveRecord: IInternalResolveRecord,
		RefClass: typeof InstanceRefImpl | typeof InstanceDynamicRefImpl,
		refType: "ref" | "dynamic",
	): ResolveInstance<T, O> {
		const current = resolveRecord.current;
		const resolveContext = this._resolveContextRef.current;

		const instance = new RefClass(() => {
			try {
				// Restore the resolution context for lazy resolution
				this._resolveContextRef.current = resolveContext;
				setResolveRecord(resolveRecord);
				resolveRecord._internalSetCurrent(current);
				return this.resolve(serviceIdentifier, {
					...resolveOptions,
					[refType]: false, // Prevent infinite recursion
				} as ResolveOptions<T>) as T;
			} finally {
				// Clean up resolution context
				resetResolveRecord();
				this._resolveContextRef.current = undefined;
			}
		}) as ResolveInstance<T, O>;

		return instance;
	}

	/**
	 * Handles resolution of unregistered services with fallback strategies
	 *
	 * This method implements several fallback mechanisms when a service is not registered:
	 * 1. Check parent container (if exists)
	 * 2. Auto-instantiate if service identifier is a class constructor
	 * 3. Return default value if service is optional
	 * 4. Throw exception if no fallback is available
	 *
	 * @template T - The type of the service
	 * @template O - The resolve options type
	 * @param serviceIdentifier - The service identifier being resolved
	 * @param resolveOptions - Resolution options including optional and defaultValue
	 * @param resolveRecord - The resolve record for error tracking
	 * @param resolveContext - The current resolution context
	 * @returns The resolved service instance or default value
	 * @throws {ResolveException} If service is not found and not optional
	 */
	private _handleUnregisteredService<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		resolveOptions: O,
		resolveRecord: IInternalResolveRecord,
		resolveContext: ResolveContext,
	): ResolveInstance<T, O> {
		const { multiple, optional, defaultValue } = resolveOptions;

		// Strategy 1: Try to resolve from parent container
		const registeredInParent =
			this._parent &&
			!this._parent.disposed &&
			this._parent.isRegistered(serviceIdentifier, {
				recursive: true,
			});
		if (registeredInParent) {
			resolveRecord.addRecordNode({
				type: ResolveRecordTypeEnum.message,
				message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in "${this.displayName}", but found in parent container. Resolving from parent container.`,
			});

			return this._parent.resolve(
				serviceIdentifier,
				resolveOptions,
			) as ResolveInstance<T, O>;
		}

		// Strategy 2: Auto-instantiate if service identifier is a class constructor
		if (typeof serviceIdentifier === "function") {
			resolveRecord.addRecordNode({
				type: ResolveRecordTypeEnum.message,
				message: `Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in "${this.displayName}", but it is a class constructor, try to resolve as transient service.`,
			});

			return this._resolveInternal({
				container: this,
				serviceIdentifier,
				resolveOptions,
				registration: new RegistrationImpl({
					lifecycle: LifecycleEnum.transient,
					useClass: serviceIdentifier as Constructor<T>,
				}),
				resolveContext,
				resolveRecord,
			}) as ResolveInstance<T, O>;
		}

		// Strategy 3: Return default value if service is optional
		if (optional) {
			if (multiple && !("defaultValue" in resolveOptions)) {
				return [] as ResolveInstance<T, O>;
			}

			return defaultValue as ResolveInstance<T, O>;
		}

		// Strategy 4: Throw exception if no fallback is available
		throw new ResolveException(
			CoreErrorCodeEnum.E_SERVICE_NOT_FOUND,
			`Service identifier "${getServiceIdentifierName(serviceIdentifier)}" is not registered in this container. Please register it first or set the "optional" option to true if this service is optional.`,
			resolveRecord,
		);
	}

	/**
	 * Gets or creates the current resolve context
	 *
	 * The resolve context stores resolution-scoped instances, ensuring that services
	 * with resolution lifecycle are created once per resolution tree.
	 *
	 * @returns The current resolve context
	 */
	private _getResolveContext(): ResolveContext {
		if (!this._resolveContextRef.current) {
			this._resolveContextRef.current = new Map();
		}
		return this._resolveContextRef.current;
	}

	/**
	 * Global root container instance
	 *
	 * This is the default container used when no explicit container is specified.
	 * It serves as the root of the container hierarchy.
	 */
	static rootContainer: IContainer = new ContainerImpl("Root");
}
