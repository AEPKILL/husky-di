/**
 * @overview Internal service registrations used by the core container.
 * @author AEPKILL
 * @created 2026-06-24 00:00:00
 */

import { DisposableRegistryImpl } from "@/impls/DisposableRegistryImpl";
import { IContainer } from "@/interfaces/container.interface";
import { IDisposableRegistry } from "@/interfaces/disposable-registry.interface";
import type { CreateRegistrationOptions } from "@/interfaces/registration.interface";
import type { ServiceIdentifier } from "@/types/service-identifier.type";

export const INTERNAL_SERVICES: Array<{
	serviceIdentifier: ServiceIdentifier<unknown>;
	registrationOptions: CreateRegistrationOptions<unknown>;
}> = [
	{
		serviceIdentifier: IContainer,
		registrationOptions: {
			useFactory(container) {
				return container;
			},
		},
	},
	{
		serviceIdentifier: IDisposableRegistry,
		registrationOptions: {
			useClass: DisposableRegistryImpl,
		},
	},
];
