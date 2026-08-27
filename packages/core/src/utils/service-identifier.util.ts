/**
 * Utility functions for service identifiers.
 *
 * @overview
 * Provides helper functions for working with service identifiers, including
 * creating type-safe identifiers, checking if values are valid identifiers,
 * and extracting human-readable names from identifiers.
 *
 * @author AEPKILL
 * @created 2025-06-24 23:06:55
 */

import { CoreErrorCodeEnum } from "@/enums/core-error-code.enum";
import { CoreException } from "@/exceptions/core.exception";
import type {
	CreatedServiceIdentifier,
	ServiceIdentifier,
} from "@/types/service-identifier.type";
import { assertValidServiceIdentifier } from "@/utils/registration.util";

/**
 * Options for creating a service identifier.
 *
 * @typeParam Metadata - The metadata type associated with the identifier
 */
export type CreateServiceIdentifierOptions<Metadata = unknown> = {
	/**
	 * Optional out-of-band metadata associated with the service identifier.
	 *
	 * @remarks
	 * This metadata does not participate in container registration or
	 * resolution behavior. It is intended for external consumers such as
	 * tooling, adapters, or documentation helpers.
	 */
	readonly metadata?: Metadata | undefined;
};

/**
 * Creates a type-safe service identifier from a string or symbol.
 *
 * @typeParam T - The service type
 * @param id - The identifier, either a string or symbol
 * @param options - Optional metadata associated with the identifier
 * @returns A type-safe service identifier
 *
 * @example
 * ```typescript
 * const UserService = createServiceIdentifier<IUserService>('UserService');
 * const TokenSymbol = createServiceIdentifier<string>(Symbol('token'));
 * const RemoteUserService = createServiceIdentifier<IUserService>(
 *   'RemoteUserService',
 *   { metadata: { transport: 'http' } },
 * );
 * ```
 */
export function createServiceIdentifier<T, Metadata = unknown>(
	id: string | symbol,
	options?: CreateServiceIdentifierOptions<Metadata>,
): CreatedServiceIdentifier<T> {
	if (typeof id !== "string" && typeof id !== "symbol") {
		throw new CoreException(
			CoreErrorCodeEnum.E_INVALID_SERVICE_IDENTIFIER,
			"A created service identifier must be a string or symbol.",
		);
	}

	const serviceIdentifier = id as CreatedServiceIdentifier<T>;

	if (options && "metadata" in options) {
		serviceIdentifierMetadataRegistry.set(
			serviceIdentifier as ServiceIdentifier<unknown>,
			options.metadata,
		);
	}

	return serviceIdentifier;
}

/**
 * Gets metadata associated with a service identifier.
 *
 * @remarks
 * Metadata is stored out of band and does not affect registration or
 * resolution behavior. For string identifiers, metadata is associated by
 * string equality.
 *
 * @typeParam Metadata - The metadata type associated with the identifier
 * @param serviceIdentifier - The service identifier
 * @returns The associated metadata, if any
 */
export function getServiceIdentifierMetadata<Metadata = unknown>(
	serviceIdentifier: ServiceIdentifier<unknown>,
): Metadata | undefined {
	return serviceIdentifierMetadataRegistry.get(serviceIdentifier) as
		| Metadata
		| undefined;
}

/**
 * Checks whether metadata has been associated with a service identifier.
 *
 * @remarks
 * This function distinguishes between "no metadata association exists" and
 * "metadata was explicitly associated with the value `undefined`".
 *
 * @param serviceIdentifier - The service identifier
 * @returns True when metadata has been associated with the identifier
 */
export function hasServiceIdentifierMetadata(
	serviceIdentifier: ServiceIdentifier<unknown>,
): boolean {
	return serviceIdentifierMetadataRegistry.has(serviceIdentifier);
}

/**
 * Gets a human-readable name from a service identifier.
 *
 * @remarks
 * Extracts a readable string representation from different types of service
 * identifiers. For functions, uses the function name; for symbols, uses the
 * description or string representation; for strings, returns the string itself.
 *
 * @param serviceIdentifier - The service identifier
 * @returns A string representation of the service identifier
 *
 * @example
 * ```typescript
 * const name1 = getServiceIdentifierName('UserService'); // 'UserService'
 * const name2 = getServiceIdentifierName(Symbol('token')); // 'Symbol(token)'
 * const name3 = getServiceIdentifierName(MyClass); // 'MyClass'
 * ```
 */
export function getServiceIdentifierName(
	serviceIdentifier: ServiceIdentifier<unknown>,
): string {
	assertValidServiceIdentifier(serviceIdentifier);

	if (typeof serviceIdentifier === "function") {
		return serviceIdentifier.name || "Anonymous";
	}

	if (typeof serviceIdentifier === "symbol") {
		return serviceIdentifier.description || serviceIdentifier.toString();
	}

	return serviceIdentifier;
}

const serviceIdentifierMetadataRegistry = new Map<
	ServiceIdentifier<unknown>,
	unknown
>();
