/**
 * @overview Registration plan type definitions.
 *
 * @author AEPKILL
 * @created 2026-06-25 00:00:00
 */

import type { CreateRegistrationOptions } from "@/interfaces/registration.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * A single entry inside a registration plan.
 *
 * @typeParam T - The service type being registered
 */
export type RegistrationPlanEntry<T = unknown> = {
	/** The identifier of the service to register. */
	readonly serviceIdentifier: ServiceIdentifier<T>;
	/** The registration options defining how to create the service. */
	readonly registration: CreateRegistrationOptions<T>;
};

/**
 * Registrar function exposed while creating a registration plan.
 */
export type RegistrationPlanRegister = <T>(
	serviceIdentifier: ServiceIdentifier<T>,
	registration: CreateRegistrationOptions<T>,
) => void;

/**
 * Callback used to declare a registration plan.
 */
export type RegistrationPlanConfigure = (
	register: RegistrationPlanRegister,
) => void;

/**
 * Reusable ordered group of registration entries.
 */
export type RegistrationPlan = {
	readonly registrations: ReadonlyArray<RegistrationPlanEntry<unknown>>;
};
