/**
 * @overview Registration class implementation
 * @author AEPKILL
 * @created 2025-07-29 22:27:57
 */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import { CoreException } from "@/exceptions/core.exception";
import type { IContainer } from "@/interfaces/container.interface";
import type { IDisplayName } from "@/interfaces/display-name.interface";
import type {
	CreateAliasRegistrationOptions,
	CreateRegistrationOptions,
	IInternalRegistration,
	IRegistration,
} from "@/interfaces/registration.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { isValidServiceIdentifier } from "@/utils/registration.util";
import { createRegistrationId } from "@/utils/uuid.util";

/**
 * Registration class
 *
 * Represents a service registration in the dependency injection container.
 * Manages service creation strategies (class, factory, value, alias), lifecycle
 * management, instance caching, and provides storage for middleware data.
 *
 * @template T The type of the service instance
 */
export class RegistrationImpl<T>
	implements IInternalRegistration<T>, IDisplayName
{
	/**
	 * Unique identifier for this registration
	 */
	public readonly id: string;

	/**
	 * Registration type (class, factory, value, or alias)
	 */
	public readonly type: RegistrationTypeEnum;

	/**
	 * The service identifier associated with this registration.
	 */
	public readonly serviceIdentifier: ServiceIdentifier<T>;

	/**
	 * Lifecycle strategy for instance management
	 */
	public readonly lifecycle: LifecycleEnum;

	/**
	 * Cached instance (used for singleton and resolution lifecycles)
	 */
	private _instance: T | undefined;

	/**
	 * Whether the instance has been resolved
	 */
	private _resolved: boolean = false;

	/**
	 * Service provider (constructor, factory function, value, or alias identifier)
	 */
	public readonly provider: IRegistration<T>["provider"];

	/**
	 * Optional container getter function (used for alias registrations)
	 */
	public readonly getContainer?: () => IContainer;

	/**
	 * Display name for debugging purposes
	 */
	public get displayName(): string {
		return this.id;
	}

	/**
	 * Creates a new registration instance
	 * @param serviceIdentifier The identifier of the service being registered
	 * @param options Registration options specifying the service creation strategy
	 */
	constructor(
		serviceIdentifier: ServiceIdentifier<T>,
		options: CreateRegistrationOptions<T>,
	) {
		this.id = createRegistrationId();
		this.serviceIdentifier = serviceIdentifier;

		const { getContainer, lifecycle, provider, type } =
			resolveProviderDefinition(options);
		this.type = type;
		this.provider = provider;
		this.lifecycle = lifecycle;
		this.getContainer = getContainer;

		if (this.type === RegistrationTypeEnum.value) {
			this._instance = this.provider as T;
			this._resolved = true;
		}
	}

	/**
	 * Gets the cached instance
	 * @returns The instance if it has been created, otherwise undefined
	 */
	public get instance(): T | undefined {
		return this._instance;
	}

	/**
	 * Gets whether the instance has been resolved
	 * @returns True if the instance has been resolved, otherwise false
	 */
	public get resolved(): boolean {
		return this._resolved;
	}

	/**
	 * Sets the resolved state
	 * @param resolved Whether the instance has been resolved
	 * @internal
	 */
	public _internalSetResolved(resolved: boolean): void {
		this._resolved = resolved;
	}

	/**
	 * Sets the cached instance
	 * @param instance The instance to cache
	 * @internal
	 */
	public _internalSetInstance(instance: T): void {
		this._instance = instance;
	}
}

const REGISTRATION_PROVIDER_KEYS = [
	"useClass",
	"useFactory",
	"useValue",
	"useAlias",
] as const;

type RegistrationProviderDefinition<T> = {
	getContainer?: () => IContainer;
	lifecycle: LifecycleEnum;
	provider: IRegistration<T>["provider"];
	type: RegistrationTypeEnum;
};

function resolveProviderDefinition<T>(
	options: CreateRegistrationOptions<T>,
): RegistrationProviderDefinition<T> {
	const providerKeys = REGISTRATION_PROVIDER_KEYS.filter(
		(key) => key in options,
	);
	if (providerKeys.length !== 1) {
		throw new CoreException(
			CoreErrorCodeEnum.E_INVALID_PROVIDER,
			"Registration must specify exactly one provider strategy.",
		);
	}

	if ("useClass" in options) {
		if (typeof options.useClass !== "function") {
			throw new CoreException(
				CoreErrorCodeEnum.E_INVALID_PROVIDER,
				"useClass must be a constructor function.",
			);
		}

		return {
			lifecycle: options.lifecycle ?? LifecycleEnum.transient,
			provider: options.useClass,
			type: RegistrationTypeEnum.class,
		};
	}

	if ("useFactory" in options) {
		if (typeof options.useFactory !== "function") {
			throw new CoreException(
				CoreErrorCodeEnum.E_INVALID_PROVIDER,
				"useFactory must be a function.",
			);
		}

		return {
			lifecycle: options.lifecycle ?? LifecycleEnum.transient,
			provider: options.useFactory,
			type: RegistrationTypeEnum.factory,
		};
	}

	if ("useValue" in options) {
		return {
			lifecycle: options.lifecycle ?? LifecycleEnum.transient,
			provider: options.useValue,
			type: RegistrationTypeEnum.value,
		};
	}

	if ("useAlias" in options) {
		const aliasOptions = options as CreateAliasRegistrationOptions<T>;
		if (!isValidServiceIdentifier(aliasOptions.useAlias)) {
			throw new CoreException(
				CoreErrorCodeEnum.E_INVALID_PROVIDER,
				"useAlias must be a valid service identifier.",
			);
		}

		if (
			aliasOptions.getContainer !== undefined &&
			typeof aliasOptions.getContainer !== "function"
		) {
			throw new CoreException(
				CoreErrorCodeEnum.E_INVALID_PROVIDER,
				"getContainer must be a function.",
			);
		}

		return {
			getContainer: options.getContainer,
			lifecycle: LifecycleEnum.transient,
			provider: options.useAlias,
			type: RegistrationTypeEnum.alias,
		};
	}

	throw new CoreException(
		CoreErrorCodeEnum.E_INVALID_PROVIDER,
		"Unsupported registration options",
	);
}
