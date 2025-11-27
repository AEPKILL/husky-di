/**
 * Abstract constructor type definition.
 *
 * @overview
 * Represents an abstract class constructor that cannot be instantiated directly.
 * Used for type-safe service identification when working with abstract base classes.
 *
 * @typeParam T - The instance type that the abstract constructor produces
 *
 * @author AEPKILL
 * @created 2025-08-14 21:09:52
 */

// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
