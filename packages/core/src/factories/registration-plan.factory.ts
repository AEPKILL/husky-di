/**
 * @overview Registration plan factory.
 *
 * @author AEPKILL
 * @created 2026-06-25 00:00:00
 */

import type { CreateRegistrationOptions } from "@/interfaces/registration.interface";
import type {
	RegistrationPlan,
	RegistrationPlanConfigure,
	RegistrationPlanEntry,
	RegistrationPlanRegister,
} from "@/types/registration-plan.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Creates a reusable registration plan.
 *
 * @param configure - Callback used to declare registration entries
 * @returns A reusable registration plan that can be applied to a container
 *
 * @example
 * ```typescript
 * const plan = createRegistrationPlan((register) => {
 *   register(ILogger, { useClass: ConsoleLogger });
 *   register(IConfig, { useValue: config });
 * });
 *
 * const cleanup = container.applyRegistrationPlan(plan);
 * ```
 */
export function createRegistrationPlan(
	configure: RegistrationPlanConfigure,
): RegistrationPlan {
	const registrations: Array<RegistrationPlanEntry<unknown>> = [];
	const register: RegistrationPlanRegister = (
		serviceIdentifier,
		registration,
	) => {
		registrations.push({
			serviceIdentifier: serviceIdentifier as ServiceIdentifier<unknown>,
			registration: registration as CreateRegistrationOptions<unknown>,
		});
	};

	configure(register);

	return Object.freeze({
		registrations: Object.freeze([...registrations]),
	});
}
