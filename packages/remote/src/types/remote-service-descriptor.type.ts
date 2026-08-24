/**
 * @overview Internal type mapping for mixed Remote Service Descriptors and facades.
 * @author AEPKILL
 * @created 2026-08-24 00:00:00
 */

import type { ServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";

// biome-ignore lint/suspicious/noExplicitAny: method extraction must preserve arbitrary parameter variance.
export type AnyMethod = (...args: any[]) => unknown;

type IsAny<T> = 0 extends 1 & T ? true : false;
type IsNever<T> = [T] extends [never] ? true : false;

type Contains<T, Candidate> =
	IsAny<T> extends true
		? true
		: [Extract<T, Candidate>] extends [never]
			? false
			: true;

type UnsupportedParameterCapability =
	| Observable<unknown>
	| AsyncIterable<unknown>
	| ReadableStream<unknown>
	| PromiseLike<unknown>;

type HasUnsupportedParameter<F extends AnyMethod> = Contains<
	Parameters<F>[number],
	UnsupportedParameterCapability
>;

type HasAbortSignalParameter<F extends AnyMethod> = Contains<
	Parameters<F>[number],
	AbortSignal
>;

type UnsupportedUnaryResult =
	| Observable<unknown>
	| AsyncIterable<unknown>
	| ReadableStream<unknown>;

type IsUnsupportedUnaryResult<R> =
	IsNever<R> extends true
		? true
		: IsAny<R> extends true
			? true
			: Contains<R, UnsupportedUnaryResult>;

type HasUnsupportedUnaryResult<F extends AnyMethod> =
	IsUnsupportedUnaryResult<ReturnType<F>> extends true
		? true
		: IsUnsupportedUnaryResult<Awaited<ReturnType<F>>>;

type HasValidCancellationSlot<F extends AnyMethod> =
	Parameters<F> extends [...infer Head, infer Last]
		? number extends Parameters<F>["length"]
			? false
			: IsAny<Last> extends true
				? false
				: [Last] extends [AbortSignal]
					? [AbortSignal] extends [Last]
						? Contains<Head[number], AbortSignal> extends false
							? true
							: false
						: false
					: false
		: false;

type HasSupportedStreamResult<R> =
	IsNever<R> extends true
		? false
		: IsAny<R> extends true
			? false
			: [R] extends [Observable<infer Item>]
				? IsNever<Item> extends true
					? false
					: IsAny<Item> extends true
						? false
						: Contains<Item, UnsupportedParameterCapability> extends false
							? true
							: false
				: false;

type IfEqual<X, Y, Yes, No> =
	(<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
		? Yes
		: No;

type ReadonlyKey<T> = {
	[K in keyof T]-?: IfEqual<
		{ [P in K]: T[P] },
		{ -readonly [P in K]: T[P] },
		never,
		K
	>;
}[keyof T];

type RequiredKey<T> = {
	[K in keyof T]-?: Pick<T, K> extends Required<Pick<T, K>> ? K : never;
}[keyof T];

type RpcUnaryMemberDefinition<F extends AnyMethod> =
	HasUnsupportedParameter<F> extends true
		? never
		: HasUnsupportedUnaryResult<F> extends true
			? never
			: HasAbortSignalParameter<F> extends false
				? { readonly kind: "unary" }
				: HasValidCancellationSlot<F> extends true
					? {
							readonly kind: "unary";
							readonly cancelable: true;
						}
					: never;

type RpcStreamMethodDefinition<F extends AnyMethod> =
	HasUnsupportedParameter<F> extends true
		? never
		: HasAbortSignalParameter<F> extends true
			? never
			: HasSupportedStreamResult<ReturnType<F>> extends true
				? { readonly kind: "stream-method" }
				: never;

type RpcMemberDefinition<T, K extends keyof T> = K extends "then"
	? never
	: T[K] extends AnyMethod
		? RpcUnaryMemberDefinition<T[K]> | RpcStreamMethodDefinition<T[K]>
		: K extends string
			? K extends `${string}$`
				? K extends RequiredKey<T>
					? K extends ReadonlyKey<T>
						? HasSupportedStreamResult<T[K]> extends true
							? { readonly kind: "stream-property" }
							: never
						: never
					: never
				: never
			: never;

export type RpcMemberDefinitions<T> = Partial<{
	readonly [K in keyof T]: K extends string ? RpcMemberDefinition<T, K> : never;
}>;

type ExactDefinition<Expected, Actual> = Expected extends unknown
	? Actual extends Expected
		? Exclude<keyof Actual, keyof Expected> extends never
			? Actual
			: never
		: never
	: never;

export type ValidateMemberDefinitions<T, Members extends object> = {
	readonly [K in keyof Members]: K extends keyof T
		? ExactDefinition<RpcMemberDefinition<T, K>, Members[K]>
		: never;
};

export type SelectedMemberKey<Members> = Extract<RequiredKey<Members>, string>;

export type NonEmptyMemberDefinitions<Members extends object> = [
	SelectedMemberKey<Members>,
] extends [never]
	? never
	: unknown;

export type IsCancelableMethod<Definition> = Definition extends {
	readonly kind: "unary";
	readonly cancelable: true;
}
	? true
	: false;

type RemoteUnaryMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Args extends [...infer Head, AbortSignal]
			? (
					...args: [...Head, signal: AbortSignal | undefined]
				) => Promise<Awaited<Result>>
			: never
		: (...args: Args) => Promise<Awaited<Result>>
	: never;

type RemoteMember<T, K extends keyof T, Definition> = Definition extends {
	readonly kind: "unary";
}
	? RemoteUnaryMethod<Extract<T[K], AnyMethod>, Definition>
	: Definition extends { readonly kind: "stream-method" }
		? T[K] extends (...args: infer Args) => Observable<infer Item>
			? (...args: Args) => Observable<Item>
			: never
		: Definition extends { readonly kind: "stream-property" }
			? T[K] extends Observable<infer Item>
				? Observable<Item>
				: never
			: never;

export type RemoteService<T, Members extends RpcMemberDefinitions<T>> = {
	readonly [K in Extract<SelectedMemberKey<Members>, keyof T>]: RemoteMember<
		T,
		K,
		Members[K]
	>;
} & { readonly then?: never };

export type RemoteServiceImplementation<
	T,
	Members extends RpcMemberDefinitions<T>,
> = Required<Pick<T, Extract<SelectedMemberKey<Members>, keyof T>>>;

export type RpcMemberInteraction =
	| Readonly<{ kind: "unary"; cancelable: boolean }>
	| Readonly<{ kind: "stream-method" }>
	| Readonly<{ kind: "stream-property" }>;

export type RemoteServiceDescriptorData = Readonly<{
	serviceIdentifier: ServiceIdentifier<unknown>;
	wireName: string;
	members: Readonly<Record<string, RpcMemberInteraction>>;
}>;
