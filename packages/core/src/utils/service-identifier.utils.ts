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

import type { ServiceIdentifier } from "@/types/service-identifier.type";

/**
 * Creates a type-safe service identifier from a string or symbol.
 *
 * @typeParam T - The service type
 * @param id - The identifier, either a string or symbol
 * @returns A type-safe service identifier
 *
 * @example
 * ```typescript
 * const UserService = createServiceIdentifier<IUserService>('UserService');
 * const TokenSymbol = createServiceIdentifier<string>(Symbol('token'));
 * ```
 */
export function createServiceIdentifier<T>(
	id: string | symbol,
): ServiceIdentifier<T> {
	return id as ServiceIdentifier<T>;
}

/**
 * Type guard to check if a value is a valid service identifier.
 *
 * @remarks
 * A type guard function for runtime type checking. Returns true if the value
 * is a function, symbol, or string, which are the valid types for service identifiers.
 *
 * @typeParam T - The service type
 * @param serviceIdentifier - The value to check
 * @returns True if the value is a valid service identifier, false otherwise
 *
 * @example
 * ```typescript
 * if (isServiceIdentifier(someValue)) {
 *   // someValue is now inferred as ServiceIdentifier<T>
 *   console.log('This is a valid service identifier');
 * }
 * ```
 */
export function isServiceIdentifier<T>(
	serviceIdentifier: unknown,
): serviceIdentifier is ServiceIdentifier<T> {
	return (
		typeof serviceIdentifier === "function" ||
		typeof serviceIdentifier === "symbol" ||
		typeof serviceIdentifier === "string"
	);
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
	if (typeof serviceIdentifier === "function") {
		return serviceIdentifier.name || "Anonymous";
	}

	if (typeof serviceIdentifier === "symbol") {
		return serviceIdentifier.description || serviceIdentifier.toString();
	}

	return serviceIdentifier;
}
