/**
 * Service identifier type definitions.
 *
 * @overview
 * Defines the types that can be used to identify and resolve services
 * from the container. Service identifiers provide a flexible way to
 * reference services using classes, strings, or symbols.
 *
 * @author AEPKILL
 * @created 2021-10-02 09:17:41
 */

import type { Constructor } from "@/types/constructor.type";
import type { AbstractConstructor } from "./abstract-constructor.type";

/**
 * Union type representing all valid service identifiers.
 *
 * @typeParam T - The type of service being identified
 *
 * @example
 * ```typescript
 * // Using a class
 * class MyService {}
 * container.resolve(MyService);
 *
 * // Using a string
 * container.resolve('MyService');
 *
 * // Using a symbol
 * const MyServiceSymbol = Symbol('MyService');
 * container.resolve(MyServiceSymbol);
 * ```
 */
export type ServiceIdentifier<T> =
	| AbstractConstructor<T>
	| Constructor<T>
	| string
	| symbol;

/**
 * Extracts the instance type from a service identifier.
 *
 * @typeParam R - The service identifier type
 *
 * @example
 * ```typescript
 * type MyServiceType = ServiceIdentifierInstance<typeof MyService>;
 * // Result: MyService
 * ```
 */
export type ServiceIdentifierInstance<R extends ServiceIdentifier<unknown>> =
	R extends ServiceIdentifier<infer T> ? T : unknown;
