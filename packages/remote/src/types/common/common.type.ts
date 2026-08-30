/**
 * @overview Private reusable type-level helpers shared across remote domains.
 * @author AEPKILL
 * @created 2026-08-30 13:24:59
 */

// biome-ignore lint/suspicious/noExplicitAny: method extraction must preserve arbitrary parameter variance.
export type AnyMethod = (...args: any[]) => unknown;

export type IsAny<T> = 0 extends 1 & T ? true : false;

export type IsNever<T> = [T] extends [never] ? true : false;

export type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

export type HasAnyParameter<F extends AnyMethod> = IsAny<Parameters<F>[number]>;

export type HasNoParameters<F extends AnyMethod> =
	Parameters<F> extends []
		? true
		: IsNever<Parameters<F>[number]> extends true
			? true
			: false;
