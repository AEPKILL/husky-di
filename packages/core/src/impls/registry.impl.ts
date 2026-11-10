/**
 * @overview Owns registration creation, ordered storage, exact cleanup, and plan rollback.
 * @author AEPKILL
 * @created 2025-07-29 22:25:24 21:03:11
 */

import type { Cleanup } from "@/interfaces/disposable.interface";
import type {
	CreateRegistrationOptions,
	IRegistration,
} from "@/interfaces/registration.interface";
import type {
	IRegistry,
	RegistrationFactory,
} from "@/interfaces/registry.interface";
import type { RegistrationPlan } from "@/types/registration-plan.type";
import type { ServiceIdentifier } from "@/types/service-identifier.type";
import { assertValidServiceIdentifier } from "@/utils/registration.util";

export class RegistryImpl implements IRegistry {
	private readonly _registrationMap = new Map<
		ServiceIdentifier<unknown>,
		Array<IRegistration<unknown>>
	>();

	constructor(private readonly _createRegistration: RegistrationFactory) {}

	register<T>(
		serviceIdentifier: ServiceIdentifier<T>,
		options: CreateRegistrationOptions<T>,
	): Cleanup {
		assertValidServiceIdentifier(serviceIdentifier);
		const registration = this._createRegistration(serviceIdentifier, options);
		const registrations = [
			...(this._registrationMap.get(serviceIdentifier) ?? []),
			registration,
		];
		this._registrationMap.set(serviceIdentifier, registrations);
		return () => this._removeRegistration(registration);
	}

	applyRegistrationPlan(
		plan: RegistrationPlan,
		register: IRegistry["register"],
	): Cleanup {
		const cleanups: Cleanup[] = [];
		const cleanupPlan = () => {
			for (const cleanup of cleanups.splice(0).reverse()) {
				cleanup();
			}
		};

		try {
			for (const { serviceIdentifier, registration } of plan.registrations) {
				// Retain the container's disposal guards and public register overrides.
				cleanups.push(register(serviceIdentifier, registration));
			}
		} catch (error) {
			cleanupPlan();
			throw error;
		}
		return cleanupPlan;
	}

	getAll<T>(
		serviceIdentifier: ServiceIdentifier<T>,
	): ReadonlyArray<IRegistration<T>> {
		return (this._registrationMap.get(serviceIdentifier) ??
			[]) as ReadonlyArray<IRegistration<T>>;
	}

	has<T>(serviceIdentifier: ServiceIdentifier<T>): boolean {
		return this._registrationMap.has(serviceIdentifier);
	}

	remove<T>(serviceIdentifier: ServiceIdentifier<T>): void {
		this._registrationMap.delete(serviceIdentifier);
	}

	clear(): void {
		this._registrationMap.clear();
	}

	keys(): ServiceIdentifier<unknown>[] {
		return Array.from(this._registrationMap.keys());
	}

	private _removeRegistration<T>(registration: IRegistration<T>): void {
		const registrations = this._registrationMap.get(
			registration.serviceIdentifier,
		);
		if (!registrations) {
			return;
		}
		const nextRegistrations = registrations.filter(
			(currentRegistration) =>
				currentRegistration !== registration &&
				currentRegistration.id !== registration.id,
		);
		if (nextRegistrations.length === registrations.length) {
			return;
		}
		if (nextRegistrations.length === 0) {
			this._registrationMap.delete(registration.serviceIdentifier);
			return;
		}
		this._registrationMap.set(
			registration.serviceIdentifier,
			nextRegistrations,
		);
	}
}
