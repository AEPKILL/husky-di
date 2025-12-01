/**
 * @overview Registration class implementation
 * @author AEPKILL
 * @created 2025-07-29 22:27:57
 */

import { LifecycleEnum } from "@/enums/lifecycle.enum";
import { RegistrationTypeEnum } from "@/enums/registration-type.enum";
import type { IContainer } from "@/interfaces/container.interface";
import type { IDisplayName } from "@/interfaces/display-name.interface";
import type {
	CreateRegistrationOptions,
	IInternalRegistration,
	IRegistration,
} from "@/interfaces/registration.interface";
import { createRegistrationId } from "@/utils/uuid.utils";

/**
 * Registration class
 *
 * Represents a service registration in the dependency injection container.
 * Manages service creation strategies (class, factory, value, alias), lifecycle
 * management, instance caching, and provides storage for middleware data.
 *
 * @template T The type of the service instance
 */
export class Registration<T> implements IInternalRegistration<T>, IDisplayName {
	/**
	 * Unique identifier for this registration
	 */
	public readonly id: string;

	/**
	 * Registration type (class, factory, value, or alias)
	 */
	public readonly type: RegistrationTypeEnum;

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
	 * @param options Registration options specifying the service creation strategy
	 */
	constructor(options: CreateRegistrationOptions<T>) {
		this.id = createRegistrationId();

		if ("useClass" in options) {
			this.type = RegistrationTypeEnum.class;
			this.provider = options.useClass;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useFactory" in options) {
			this.type = RegistrationTypeEnum.factory;
			this.provider = options.useFactory;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useValue" in options) {
			this.type = RegistrationTypeEnum.value;
			this.provider = options.useValue;
			this.lifecycle = options.lifecycle ?? LifecycleEnum.transient;
		} else if ("useAlias" in options) {
			this.type = RegistrationTypeEnum.alias;
			this.provider = options.useAlias;
			this.lifecycle = LifecycleEnum.transient;
			this.getContainer = options.getContainer;
		} else {
			throw new Error("Unsupported registration options");
		}

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
