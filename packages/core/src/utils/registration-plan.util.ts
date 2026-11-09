/**
 * @overview Utility for composing registration plans.
 * @author AEPKILL
 * @created 2026-11-09 20:05:00
 */

import type { RegistrationPlan } from "@/types/registration-plan.type";

/**
 * Combines registration plans in argument order, preserving duplicate entries.
 *
 * The returned plan and its registration array are frozen; entries, registration
 * options, and service values retain their original references. Registrations are
 * validated when the merged plan is applied to a container.
 *
 * @param plans - Registration plans to combine
 * @returns A new frozen plan, empty when no plans are supplied
 *
 * @example
 * ```typescript
 * const appPlan = mergeRegistrationPlans(infraPlan, businessPlan);
 * const cleanup = container.applyRegistrationPlan(appPlan);
 * ```
 */
export function mergeRegistrationPlans(
	...plans: readonly RegistrationPlan[]
): RegistrationPlan {
	return Object.freeze({
		registrations: Object.freeze(plans.flatMap((plan) => plan.registrations)),
	});
}
