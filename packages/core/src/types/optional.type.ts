/**
 * Utility type to make specific properties optional.
 *
 * @overview
 * Creates a new type where specified keys from the original type are made optional,
 * while keeping all other properties required.
 *
 * @typeParam T - The original type
 * @typeParam K - The keys to make optional
 *
 * @example
 * ```typescript
 * interface User {
 *   name: string;
 *   age: number;
 *   email: string;
 * }
 *
 * type UserWithOptionalEmail = Optional<User, 'email'>;
 * // Result: { name: string; age: number; email?: string; }
 * ```
 *
 * @author AEPKILL
 * @created 2025-07-30 00:36:55
 */
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
