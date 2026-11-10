/**
 * @overview Owns registration installation, ordered lookup, and cleanup.
 * @author AEPKILL
 * @created 2025-07-23 18:19:20 10:58:30
 */

import type { Cleanup } from "@/interfaces/disposable.interface";
import type {
	CreateRegistrationOptions,
	IRegistration,
} from "@/interfaces/registration.interface";
import type { RegistrationPlan } from "@/types/registration-plan.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export type RegistrationFactory = <T>(
	serviceIdentifier: ServiceIdentifier<T>,
	options: CreateRegistrationOptions<T>,
) => IRegistration<T>;

export interface IRegistry {
	/** Installs a registration and returns cleanup for only that installation. */
	register<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: CreateRegistrationOptions<T>,
	): Cleanup;

	/** Applies through the container's guarded registrar and rolls back on failure. */
	applyRegistrationPlan(
		plan: RegistrationPlan,
		register: IRegistry["register"],
	): Cleanup;

	/** Returns registrations in declaration order. */
	getAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
	): ReadonlyArray<IRegistration<T>>;

	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean;
	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void;
	clear(): void;
	keys(): ServiceIdentifier<unknown>[];
}
