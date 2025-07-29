/**
 * @overview
 * @author AEPKILL
 * @created 2025-07-27 21:41:36
 */

import type { Extendable, ExtendableConstraint } from "@/types/extendable.type";
import type {
	CreateRegistrationOptions,
	Registration,
	RegistrationBase,
} from "@/types/registration.type";
import { createRegistrationId } from "./uuid.utils";

export function createRegistration<
	T,
	Extra extends ExtendableConstraint<RegistrationBase<T>>,
>(
	options: CreateRegistrationOptions<T>,
	extra: Extra,
): Extendable<Registration<T>, Extra> {
	const id = createRegistrationId();
	return {
		...options,
		...extra,
		id,
		instance: undefined,
		resolved: false,
		registered: false,
	};
}
