/**
 * Registry implementation for managing service registrations.
 *
 * @overview
 * Implements the IRegistry interface to store and manage service registrations
 * in a dependency injection container. Supports multiple registrations per
 * service identifier, allowing for scenarios where multiple implementations
 * of the same service are registered.
 *
 * @author AEPKILL
 * @created 2025-07-27 21:03:11
 */

import type { IRegistration } from "@/interfaces/registration.interface";
import type { IRegistry } from "@/interfaces/registry.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Registry implementation class.
 *
 * @remarks
 * Manages service registrations using a Map structure where each service
 * identifier can have multiple registrations. The get() method returns the
 * most recently registered service (last in the array).
 */
export class Registry implements IRegistry {
	/**
	 * Map storing service registrations.
	 * Key: ServiceIdentifier, Value: Array of IRegistration
	 */
	private readonly _registrationMap = new Map<
		ServiceIdentifier<unknown>,
		Array<IRegistration<unknown>>
	>();

	/**
	 * Gets the most recent registration for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to look up
	 * @returns The most recent registration, or undefined if not found
	 */
	get<T>(
		serviceIdentifier: ServiceIdentifier<T>,
	): IRegistration<T> | undefined {
		const registrations = this._registrationMap.get(serviceIdentifier);
		if (registrations && registrations.length > 0) {
			return registrations[registrations.length - 1] as IRegistration<T>;
		}
		return undefined;
	}

	/**
	 * Gets all registrations for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to look up
	 * @returns An array of all registrations for the identifier
	 */
	getAll<T>(serviceIdentifier: ServiceIdentifier<T>): Array<IRegistration<T>> {
		const registrations = this._registrationMap.get(serviceIdentifier);
		return registrations ? (registrations as Array<IRegistration<T>>) : [];
	}

	/**
	 * Checks if a service identifier has any registrations.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to check
	 * @returns True if the identifier has registrations, false otherwise
	 */
	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
		return this._registrationMap.has(serviceIdentifier);
	}

	/**
	 * Adds a registration for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to register
	 * @param registration - The registration to add
	 */
	set<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: IRegistration<T>,
	): void {
		const registrations = [
			...(this._registrationMap.get(serviceIdentifier) || []),
			registration,
		];
		this._registrationMap.set(serviceIdentifier, registrations);
	}

	/**
	 * Sets all registrations for a service identifier, replacing existing ones.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to register
	 * @param registrations - The array of registrations to set
	 */
	setAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registrations: Array<IRegistration<T>>,
	): void {
		this._registrationMap.set(serviceIdentifier, registrations);
	}

	/**
	 * Removes all registrations for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to remove
	 */
	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		this._registrationMap.delete(serviceIdentifier);
	}

	/**
	 * Clears all registrations from the registry.
	 */
	clear(): void {
		this._registrationMap.clear();
	}

	/**
	 * Gets all registered service identifiers.
	 *
	 * @returns An array of all service identifiers that have registrations
	 */
	keys(): ServiceIdentifier<unknown>[] {
		return Array.from(this._registrationMap.keys());
	}
}
