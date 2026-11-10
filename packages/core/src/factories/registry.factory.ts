/**
 * @overview Assembles registration ownership with provider validation and identity.
 * @author AEPKILL
 * @created 2026-11-09 21:00:29
 */

import { RegistrationImpl } from "@/impls/registration.impl";
import { RegistryImpl } from "@/impls/registry.impl";
import type { IRegistry } from "@/interfaces/registry.interface";

export function createRegistry(): IRegistry {
	return new RegistryImpl(
		(serviceIdentifier, options) =>
			new RegistrationImpl(serviceIdentifier, options),
	);
}
