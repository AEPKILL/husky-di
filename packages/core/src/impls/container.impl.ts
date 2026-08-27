/**
 * @overview Container Implementation
 * @description Core dependency injection container implementation that provides service registration, resolution, and lifecycle management
 * @author AEPKILL
 * @created 2025-07-29 22:30:35
 */
/** biome-ignore-all lint/suspicious/noExplicitAny: Required for flexible middleware and registration system */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import { ResolveRecordTypeEnum } from "@/enums/resolve-record-type.enum";
import { CodedException } from "@/exceptions/coded.exception";
import { ResolveException } from "@/exceptions/resolve.exception";
import { DisposableRegistryImpl } from "@/impls/disposable-registry.impl";
import { InstanceDynamicRefImpl } from "@/impls/instance-dynamic-ref.impl";
import { InstanceRefImpl } from "@/impls/instance-ref.impl";
import { RegistrationImpl } from "@/impls/registration.impl";
import { RegistryImpl } from "@/impls/registry.impl";
import type {
	IContainer,
	IsRegisteredOptions,
	ResolveInstance,
	ResolveMiddlewareParams,
	ResolveOptions,
} from "@/interfaces/container.interface";
import type { Cleanup } from "@/interfaces/disposable.interface";
import type { IDisposableRegistry } from "@/interfaces/disposable-registry.interface";
import type {
	CreateAliasRegistrationOptions,
	CreateClassRegistrationOptions,
	CreateFactoryRegistrationOptions,
	CreateRegistrationOptions,
	CreateValueRegistrationOptions,
	IInternalRegistration,
	IRegistration,
} from "@/interfaces/registration.interface";
import type { IInternalResolveRecord } from "@/interfaces/resolve-record.interface";
import { middlewareManager } from "@/shared/instances";
import type { Constructor } from "@/types/constructor.type";
import type { Ref } from "@/types/ref.type";
import type { RegistrationPlan } from "@/types/registration-plan.type";
import type { ResolveContext } from "@/types/resolve-context.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { createAssertNotDisposed } from "@/utils/disposable.util";
import { assertValidServiceIdentifier } from "@/utils/registration.util";
import {
	getEnsureResolveContext,
	getResolveContext,
	resetResolveContext,
	setResolveContext,
} from "@/utils/resolve-context.util";
import { assertValidResolveOptions } from "@/utils/resolve-options.util";
import {
	getEnsureResolveRecord,
	getResolveRecord,
	resetResolveRecord,
	setResolveRecord,
} from "@/utils/resolve-record.util";
import { getServiceIdentifierName } from "@/utils/service-identifier.util";
import { createContainerId } from "@/utils/uuid.util";

/**
 * Dependency Injection Container Implementation
 *
 * This class provides comprehensive service registration, resolution, and lifecycle management
 * for dependency injection. It supports multiple lifecycle strategies (singleton, transient, resolution),
 * middleware chains for custom resolution logic, and hierarchical container relationships.
 *
 * @extends DisposableRegistryImpl - Provides automatic cleanup of resources
 * @implements IContainer - Public container contract
 */
export class ContainerImpl implements IContainer {
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
	private readonly _parent?: IContainer | undefined;

	/**
	 * Container name for identification and debugging
	 */
	private readonly _name: string;

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

		this._disposableRegistry.addCleanup(() => {
			middlewareManager.notifyContainerDispose(this);
		});

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
		return this._resolve(serviceIdentifier, options);
	}

	private _resolve<T, O extends ResolveOptions<T>>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: O | undefined,
	): ResolveInstance<T, O> {
		assertNotDisposed(this);
		assertValidServiceIdentifier(serviceIdentifier);

		const resolveOptions = options || ({} as ResolveOptions<T>);
		const { dynamic, ref, multiple } = resolveOptions;
		const ownsResolveRecord = !getResolveRecord();
		const resolveRecord = getEnsureResolveRecord(this);

		try {
			assertValidResolveOptions(
				serviceIdentifier,
				resolveOptions,
				resolveRecord,
			);

			const resolveContext = getEnsureResolveContext(resolveRecord);
			const registrations = this._registry.getAll(serviceIdentifier);

			return this._withResolveRecord(serviceIdentifier, resolveRecord, () => {
				// Record the resolution attempt for debugging and error reporting
				resolveRecord.addRecordNode({
					type: ResolveRecordTypeEnum.serviceIdentifier,
					resolveOptions,
					serviceIdentifier,
					container: this,
				});

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
			if (ownsResolveRecord) {
				resetResolveContext(resolveRecord);
				resetResolveRecord();
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
	): Cleanup {
		assertNotDisposed(this);
		assertValidServiceIdentifier(serviceIdentifier);

		const registrationInstance = new RegistrationImpl<T>(
			serviceIdentifier,
			registration,
		);
		this._registry.set(serviceIdentifier, registrationInstance);
		return () => {
			this._registry.removeRegistration(registrationInstance);
		};
	}

	/**
	 * Applies all entries from a registration plan.
	 *
	 * @param registrationPlan - The registration plan to apply
	 * @returns A cleanup function that removes only this plan's registrations
	 */
	public applyRegistrationPlan(registrationPlan: RegistrationPlan): Cleanup {
		assertNotDisposed(this);

		let cleaned = false;

		const cleanups: Cleanup[] = [];
		const cleanupPlan = () => {
			if (cleaned) {
				return;
			}

			cleaned = true;
			for (let index = cleanups.length - 1; index >= 0; index--) {
				cleanups[index]();
			}
		};

		try {
			for (const entry of registrationPlan.registrations) {
				cleanups.push(
					this.register(entry.serviceIdentifier, entry.registration),
				);
			}
		} catch (error) {
			cleanupPlan();
			throw error;
		}

		return cleanupPlan;
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
		assertValidServiceIdentifier(serviceIdentifier);

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
	 * Unregisters all registrations for a service from the container
	 *
	 * Removes all registrations for the service, making it unavailable for future resolutions.
	 * Note: This does not dispose existing singleton instances.
	 *
	 * @template T - The type of the service
	 * @param serviceIdentifier - The service identifier to unregister all registrations for
	 */
	public unregisterAll<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		assertNotDisposed(this);
		assertValidServiceIdentifier(serviceIdentifier);

		this._registry.remove(serviceIdentifier);
	}

	/**
	 * Retrieves all registered service identifiers
	 *
	 * @returns An array of all service identifiers currently registered in this container
	 */
	public getServiceIdentifiers(): ServiceIdentifier<unknown>[] {
		assertNotDisposed(this);

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
		const singletonStageKey = Symbol();
		type StagedLifecycleKey = ResolveContext | typeof singletonStageKey;
		const stagedLifecycleInstances = new Map<
			IRegistration<unknown>,
			Map<StagedLifecycleKey, StagedLifecycleInstance>
		>();
		const instance = middlewareManager.execute(params, (lifecycleParams) => {
			const lifecycleRegistration =
				lifecycleParams.registration as IRegistration<unknown>;
			const lifecycleKey =
				lifecycleRegistration.lifecycle === LifecycleEnum.singleton
					? singletonStageKey
					: lifecycleRegistration.lifecycle === LifecycleEnum.resolution
						? lifecycleParams.resolveContext
						: undefined;
			const stagedInstance = lifecycleKey
				? stagedLifecycleInstances.get(lifecycleRegistration)?.get(lifecycleKey)
				: undefined;
			if (stagedInstance) {
				return stagedInstance.value;
			}

			let stagedLifecycleInstance: StagedLifecycleInstance | undefined;
			const lifecycleInstance = this._resolveLifecycleInstance(
				lifecycleParams,
				(stagedInstance) => {
					stagedLifecycleInstance = stagedInstance;
				},
			);
			if (stagedLifecycleInstance && lifecycleKey) {
				let instancesByLifecycle = stagedLifecycleInstances.get(
					lifecycleRegistration,
				);
				if (!instancesByLifecycle) {
					instancesByLifecycle = new Map();
					stagedLifecycleInstances.set(
						lifecycleRegistration,
						instancesByLifecycle,
					);
				}
				instancesByLifecycle.set(lifecycleKey, stagedLifecycleInstance);
			}

			return lifecycleInstance;
		});
		const committedLifecycleInstances: StagedLifecycleInstance[] = [];
		try {
			for (const instancesByLifecycle of stagedLifecycleInstances.values()) {
				for (const stagedInstance of instancesByLifecycle.values()) {
					committedLifecycleInstances.push(stagedInstance);
					stagedInstance.commit();
				}
			}
		} catch (error: unknown) {
			for (
				let index = committedLifecycleInstances.length - 1;
				index >= 0;
				index--
			) {
				try {
					committedLifecycleInstances[index].rollback();
				} catch {
					// Preserve the commit error when a custom ResolveContext also rejects rollback.
				}
			}
			throw error;
		}

		return instance as T | Ref<T>;
	}

	private _resolveLifecycleInstance<T, O extends ResolveOptions<T>>(
		params: ResolveMiddlewareParams<T, O>,
		onCreated: (instance: StagedLifecycleInstance) => void,
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
			// Resolution-scoped services are reused only within the active resolve tree.
			if (resolveContext.has(registration)) {
				return resolveContext.get(registration) as T;
			}
		}

		const instance = this._resolveRegistration(params);

		if (isSingleton) {
			const internalRegistration = registration as IInternalRegistration<T>;
			let previousInstance: T | undefined;
			let previousResolved = false;
			let canRollback = false;
			onCreated({
				commit: () => {
					previousInstance = registration.instance;
					previousResolved = registration.resolved;
					canRollback = true;
					internalRegistration._internalSetInstance(instance);
					internalRegistration._internalSetResolved(true);
				},
				rollback: () => {
					if (!canRollback) {
						return;
					}
					internalRegistration._internalSetInstance(previousInstance as T);
					internalRegistration._internalSetResolved(previousResolved);
				},
				value: instance,
			});
		} else if (isResolution) {
			let hadPreviousInstance = false;
			let previousInstance: unknown;
			let canRollback = false;
			onCreated({
				commit: () => {
					hadPreviousInstance = resolveContext.has(registration);
					previousInstance = resolveContext.get(registration);
					canRollback = true;
					resolveContext.set(registration, instance);
				},
				rollback: () => {
					if (!canRollback) {
						return;
					}
					if (hadPreviousInstance) {
						resolveContext.set(registration, previousInstance);
					} else {
						resolveContext.delete(registration);
					}
				},
				value: instance,
			});
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
					const aliasServiceIdentifier =
						registration.provider as CreateAliasRegistrationOptions<T>["useAlias"];
					const aliasIdentifierName = getServiceIdentifierName(
						aliasServiceIdentifier,
					);
					resolveRecord.addRecordNode({
						type: ResolveRecordTypeEnum.message,
						message: registration.getContainer
							? `Resolving alias "${identifierName}" as "${aliasIdentifierName}" from configured container`
							: `Resolving alias "${identifierName}" as "${aliasIdentifierName}" from current container`,
					});
					const containerRef = registration.getContainer
						? registration.getContainer()
						: container;
					const aliasResolveOptions = resolveOptions.multiple
						? {
								...resolveOptions,
								defaultValue: undefined,
								multiple: false,
								optional: false,
							}
						: { ...resolveOptions, multiple: false };

					return containerRef.resolve(
						aliasServiceIdentifier,
						aliasResolveOptions as ResolveOptions<T>,
					) as T;
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
		resolveRecord._internalStashCurrent();
		try {
			return operation();
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
			const currentContainer = resolveRecord.getCurrentContainer() ?? this;
			throw new ResolveException(
				CoreErrorCodeEnum.E_RESOLUTION_FAILED,
				`Failed to resolve service identifier "${getServiceIdentifierName(serviceIdentifier)}" in "${currentContainer.displayName}": ${error instanceof Error ? error.message : String(error)}`,
				resolveRecord,
				error,
			);
		} finally {
			resolveRecord._internalRestoreCurrent();
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
		const resolveContext = getEnsureResolveContext(resolveRecord);

		const instance = new RefClass(() => {
			const previousResolveRecord = getResolveRecord();
			const previousCurrent = resolveRecord.current;
			const previousResolveContext = getResolveContext(resolveRecord);

			try {
				// Lazy refs must resume the original resolve tree so lifecycle caches stay consistent.
				setResolveContext(resolveRecord, resolveContext);
				setResolveRecord(resolveRecord);
				resolveRecord._internalSetCurrent(current);
				return this._resolve(serviceIdentifier, {
					...resolveOptions,
					[refType]: false, // Prevent infinite recursion
				} as ResolveOptions<T>) as T;
			} finally {
				resolveRecord._internalSetCurrent(previousCurrent);

				if (previousResolveContext) {
					setResolveContext(resolveRecord, previousResolveContext);
				} else {
					resetResolveContext(resolveRecord);
				}

				if (previousResolveRecord) {
					setResolveRecord(previousResolveRecord);
				} else {
					resetResolveRecord();
				}
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
		const {
			multiple,
			optional,
			defaultValue,
			recursive = true,
		} = resolveOptions;

		// Strategy 1: Try to resolve from parent container
		const shouldResolveFromParent =
			recursive &&
			this._parent &&
			!this._parent.disposed &&
			this._parent.isRegistered(serviceIdentifier, {
				recursive: true,
			});
		if (shouldResolveFromParent) {
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

			const instance = this._resolveInternal({
				container: this,
				serviceIdentifier,
				resolveOptions,
				registration: new RegistrationImpl(serviceIdentifier, {
					lifecycle: LifecycleEnum.transient,
					useClass: serviceIdentifier as Constructor<T>,
				}),
				resolveContext,
				resolveRecord,
			}) as T;

			return (multiple ? [instance] : instance) as ResolveInstance<T, O>;
		}

		// Strategy 3: Return default value if service is optional
		if (optional) {
			if (multiple && defaultValue === undefined) {
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
	 * Global root container instance
	 *
	 * This is the default container used when no explicit container is specified.
	 * It serves as the root of the container hierarchy.
	 */
	static rootContainer: IContainer = new ContainerImpl("Root");
}
type StagedLifecycleInstance = {
	readonly commit: () => void;
	readonly rollback: () => void;
	readonly value: unknown;
};

const assertNotDisposed = createAssertNotDisposed("Container");
