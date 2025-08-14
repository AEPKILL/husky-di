/**
 * @overview
 * @author AEPKILL
 * @created 2025-08-14 21:09:52
 */

// biome-ignore lint/suspicious/noExplicitAny: here is a generic type
export type AbstractConstructor<T> = abstract new (...args: any[]) => T;
