/**
 * @overview Remote Service Descriptor schema, public contract, and type algebra.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Observable } from "rxjs";
import { type input, type output, z } from "zod";
import type { REMOTE_SERVICE_DESCRIPTOR_TYPE } from "@/modules/peer/constants/remote-service-descriptor.const";
import { rpcWireIdentifierSchema } from "@/modules/protocol";
import type {
	AnyMethod,
	HasAnyParameter,
	IsAny,
	RequiredKey,
} from "@/shared/types/common.type";

export type RemoteMethodKey<T> = {
	[K in keyof T]-?: K extends string
		? K extends "then"
			? never
			: T[K] extends AnyMethod
				? K
				: never
		: never;
}[keyof T];

export type RpcMethodDefinitions<T> = Partial<{
	readonly [K in RemoteMethodKey<T>]: RpcUnaryMethodDefinition<
		Extract<T[K], AnyMethod>
	>;
}>;

export type ValidateMethodDefinitions<T, Definitions extends object> = {
	readonly [K in keyof Definitions]: K extends RemoteMethodKey<T>
		? ValidateMethodDefinition<Extract<T[K], AnyMethod>, Definitions[K]>
		: never;
};

export type SelectedMethodKey<Definitions> = Extract<
	RequiredKey<Definitions>,
	string
>;

export type NonEmptyMethodDefinitions<Definitions extends object> = [
	SelectedMethodKey<Definitions>,
] extends [never]
	? never
	: unknown;

export type IsCancelableMethod<Definition> =
	Definition extends RpcCancelableMethodDefinition ? true : false;

/**
 * Projects ordinary call signatures to an asynchronous facade. Generic
 * correlations are not preserved; overloaded methods use the last signature.
 */
export type RemoteMethod<F, Definition> = F extends (
	...args: infer Args
) => infer Result
	? IsCancelableMethod<Definition> extends true
		? Args extends [...infer Parameters, AbortSignal]
			? (
					...args: [...Parameters, signal: AbortSignal | undefined]
				) => Promise<Awaited<Result>>
			: never
		: (...args: Args) => Promise<Awaited<Result>>
	: never;

export type RemoteService<T, Definitions extends RpcMethodDefinitions<T>> = {
	readonly [K in Extract<
		SelectedMethodKey<Definitions>,
		RemoteMethodKey<T>
	>]: RemoteMethod<Extract<T[K], AnyMethod>, Definitions[K]>;
} & { readonly then?: never };

export type RemoteServiceImplementation<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	[K in Extract<SelectedMethodKey<Definitions>, RemoteMethodKey<T>>]-?: Extract<
		T[K],
		AnyMethod
	>;
};

/**
 * Describes one explicitly allowlisted remote service without exposing its
 * local identifier or wire metadata.
 */
export type RemoteServiceDescriptor<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = {
	readonly [REMOTE_SERVICE_DESCRIPTOR_TYPE]: (
		service: T,
		definitions: Definitions,
	) => readonly [T, Definitions];
};

export type RemoteServiceDescriptorOptions<
	T,
	Definitions extends RpcMethodDefinitions<T>,
> = Omit<
	Readonly<input<typeof remoteServiceDescriptorOptionsSchema>>,
	"methods"
> & {
	readonly methods: Definitions &
		ValidateMethodDefinitions<T, Definitions> &
		NonEmptyMethodDefinitions<Definitions>;
};

export type RemoteServiceDescriptorOptionsSnapshot = Readonly<
	output<typeof remoteServiceDescriptorOptionsSchema>
>;

export const rpcCancelableMethodDefinitionSchema = z
	.preprocess(
		(value) => ({
			definition: value,
			ownKeys: Object.keys(Object(value)),
		}),
		z.object({
			definition: z.strictObject({
				cancelable: z.literal(true),
			}),
			ownKeys: z.array(z.literal("cancelable")).max(1),
		}),
	)
	.transform(({ definition }) => definition)
	.readonly();

export const rpcMethodNameSchema = rpcWireIdentifierSchema.refine(
	(methodName) => methodName !== "then",
);

export const rpcMethodDefinitionSchema = z.union([
	z.literal(true),
	rpcCancelableMethodDefinitionSchema,
]);

export const rpcMethodDefinitionsSchema = z
	.preprocess(
		(value) => ({
			source: value,
			entries: Object.entries(Object(value)),
		}),
		z.object({
			source: z.object({}),
			entries: z
				.array(z.tuple([rpcMethodNameSchema, rpcMethodDefinitionSchema]))
				.min(1),
		}),
	)
	.transform(({ entries }) => {
		const methods = Object.create(null) as Record<string, RpcMethodDefinition>;
		for (const [methodName, definition] of entries) {
			methods[methodName] = definition;
		}
		return methods;
	})
	.readonly();

export const remoteServiceDescriptorOptionsSchema = z
	.object({
		wireName: rpcWireIdentifierSchema,
		methods: rpcMethodDefinitionsSchema,
	})
	.readonly();

type RpcMethodDefinition = output<typeof rpcMethodDefinitionSchema>;

type RpcCancelableMethodDefinition = output<
	typeof rpcCancelableMethodDefinitionSchema
>;

type ContainsAbortSignal<T> =
	IsAny<T> extends true
		? false
		: [Extract<T, AbortSignal>] extends [never]
			? false
			: true;

// Inspect each slot before combining results: unknown would absorb a signal
// from another slot if the parameter types were first collapsed into a union.
type TupleContainsAbortSignal<Args extends readonly unknown[]> = true extends {
	[K in keyof Args]: ContainsAbortSignal<Args[K]>;
}[number]
	? true
	: false;

type HasUnsupportedUnaryResult<F extends AnyMethod> =
	IsAny<Awaited<ReturnType<F>>> extends true
		? true
		: Extract<
					Awaited<ReturnType<F>>,
					Observable<unknown> | AsyncIterable<unknown>
				> extends never
			? false
			: true;

type HasValidCancellationSlot<F extends AnyMethod> =
	Parameters<F> extends [...infer Head, infer Last]
		? number extends Parameters<F>["length"]
			? false
			: IsAny<Last> extends true
				? false
				: [Last] extends [AbortSignal]
					? [AbortSignal] extends [Last]
						? TupleContainsAbortSignal<Head> extends false
							? true
							: false
						: false
					: false
		: false;

type RpcUnaryMethodDefinition<F extends AnyMethod> =
	HasAnyParameter<F> extends true
		? never
		: HasUnsupportedUnaryResult<F> extends true
			? never
			: TupleContainsAbortSignal<Parameters<F>> extends false
				? true
				: HasValidCancellationSlot<F> extends true
					? RpcCancelableMethodDefinition
					: never;

type ValidateMethodDefinition<F extends AnyMethod, Definition> =
	Definition extends RpcUnaryMethodDefinition<F>
		? Definition extends true
			? Definition
			: Definition extends RpcCancelableMethodDefinition
				? Exclude<
						keyof Definition,
						keyof RpcCancelableMethodDefinition
					> extends never
					? Definition
					: never
				: never
		: never;
