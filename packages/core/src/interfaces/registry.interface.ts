/**
 * Registry interface for managing service registrations.
 *
 * @overview
 * Defines the contract for a registry that stores and retrieves service
 * registrations. The registry maps service identifiers to their corresponding
 * registration objects, supporting both single and multiple registrations
 * per identifier.
 *
 * @author AEPKILL
 * @created 2023-10-10 10:58:30
 */

import type { ServiceIdentifier } from "@/types/service-identifier.type";
import type { IRegistration } from "./registration.interface";

/**
 * Registry interface for managing service registrations.
 *
 * @remarks
 * The registry provides methods to store, retrieve, and manage service
 * registrations. It supports both single and multiple registrations per
 * service identifier, enabling scenarios where multiple implementations
 * of the same service are registered.
 */
export interface IRegistry {
	/**
	 * Gets a single registration for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to look up
	 * @returns The registration if found, undefined otherwise
	 */
	get<T>(serviceIdentifier: ServiceIdentifier<T>): undefined | IRegistration<T>;

	/**
	 * Gets all registrations for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to look up
	 * @returns An array of all registrations for the identifier
	 */
	getAll<T>(serviceIdentifier: ServiceIdentifier<T>): Array<IRegistration<T>>;

	/**
	 * Checks if a service identifier has any registrations.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to check
	 * @returns True if the identifier has registrations, false otherwise
	 */
	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;

	/**
	 * Sets a single registration for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to register
	 * @param registration - The registration to store
	 */
	set<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registration: IRegistration<T>,
	): void;

	/**
	 * Sets multiple registrations for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to register
	 * @param registrations - The array of registrations to store
	 */
	setAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		registrations: Array<IRegistration<T>>,
	): void;

	/**
	 * Removes all registrations for a service identifier.
	 *
	 * @typeParam T - The service type
	 * @param serviceIdentifier - The service identifier to remove
	 */
	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void;

	/**
	 * Clears all registrations from the registry.
	 */
	clear(): void;
}
