/**
 * Utility type to remove readonly modifiers from all properties.
 *
 * @overview
 * Creates a new type where all readonly properties from the original type
 * are made writable. Useful for internal implementations that need to
 * mutate readonly types.
 *
 * @typeParam T - The original type with readonly properties
 *
 * @example
 * ```typescript
 * interface Config {
 *   readonly apiUrl: string;
 *   readonly timeout: number;
 * }
 *
 * type MutableConfig = Writable<Config>;
 * // Result: { apiUrl: string; timeout: number; } (all properties are writable)
 * ```
 *
 * @author AEPKILL
 * @created 2025-07-23 19:55:00
 */
export type Writable<T> = {
	-readonly [P in keyof T]: T[P];
};
