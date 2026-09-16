/**
 * @overview Remote Service Descriptor schema, public contract, and type algebra.
 * @author AEPKILL
 * @created 2026-08-19 09:27:48
 */

import type { Observable } from "rxjs";
import { type input, type output, z } from "zod";

import type { REMOTE_SERVICE_DESCRIPTOR_TYPE } from "@/modules/peer/constants/remote-service-descriptor.const";
import { rpcWireIdentifierSchema } from "@/modules/protocol";
import type {
	AnyMethod,
	HasAnyParameter,
	HasNoParameters,
	IsAny,
	RequiredKey,
} from "@/shared/types/common.type";

export type RpcFunctionMemberDefinition =
	| { readonly kind: "function" }
	| { readonly kind: "function"; readonly cancelable: true };
export type RpcObservableFunctionMemberDefinition = {
	readonly kind: "observable-function";
};
export type RpcObservableMemberDefinition = { readonly kind: "observable" };
export type RpcMemberDefinition =
	| RpcFunctionMemberDefinition
	| RpcObservableFunctionMemberDefinition
	| RpcObservableMemberDefinition;
export type RpcMemberKind = RpcMemberDefinition["kind"];

export type RemoteMemberKey<T> = {
	[K in keyof T]-?: K extends string ? (K extends "then" ? never : K) : never;
}[keyof T];

export type RpcMemberDefinitions<T> = Partial<{
	readonly [K in RemoteMemberKey<T>]: RpcMemberDefinition;
}>;

type HasUnsupportedUnaryResult<F extends AnyMethod> =
	IsAny<Awaited<ReturnType<F>>> extends true
		? true
		: Extract<
					Awaited<ReturnType<F>>,
					Observable<unknown> | AsyncIterable<unknown>
				> extends never
			? false
			: true;
type ContainsAbortSignal<T> = [Extract<T, AbortSignal>] extends [never]
	? false
	: true;
type HasValidCancellationSlot<F extends AnyMethod> =
	Parameters<F> extends [...infer Head, infer Last]
		? number extends Parameters<F>["length"]
			? false
			: [Last] extends [AbortSignal]
				? [AbortSignal] extends [Last]
					? ContainsAbortSignal<Head[number]> extends false
						? true
						: false
					: false
				: false
		: false;
type ValidFunctionDefinition<F extends AnyMethod> =
	HasAnyParameter<F> extends true
		? never
		: HasUnsupportedUnaryResult<F> extends true
			? never
			: HasNoParameters<F> extends true
				? RpcFunctionMemberDefinition
				: ContainsAbortSignal<Parameters<F>[number]> extends false
					? { readonly kind: "function" }
					: HasValidCancellationSlot<F> extends true
						? { readonly kind: "function"; readonly cancelable: true }
						: never;
type ValidObservableFunctionDefinition<F extends AnyMethod> =
	IsAny<ReturnType<F>> extends true
		? never
		: ReturnType<F> extends Observable<unknown>
			? ContainsAbortSignal<Parameters<F>[number]> extends true
				? never
				: { readonly kind: "observable-function" }
			: never;
type ValidMemberDefinition<Member> = Member extends AnyMethod
	? ValidFunctionDefinition<Member> | ValidObservableFunctionDefinition<Member>
	: Member extends Observable<unknown>
		? { readonly kind: "observable" }
		: never;

export type ValidateMemberDefinitions<T, Definitions extends object> = {
	readonly [K in keyof Definitions]: K extends RemoteMemberKey<T>
		? Definitions[K] extends ValidMemberDefinition<T[K & keyof T]>
			? Definitions[K]
			: never
		: never;
};

export type SelectedMemberKey<Definitions> = Extract<
	RequiredKey<Definitions>,
	string
>;
export type NonEmptyMemberDefinitions<Definitions extends object> = [
	SelectedMemberKey<Definitions>,
] extends [never]
	? never
	: unknown;

type DefinitionFor<
	Definitions,
	Key extends PropertyKey,
> = Key extends keyof Definitions ? Definitions[Key] : never;
type RemoteMember<F, Definition> = Definition extends {
	readonly kind: "observable-function";
}
	? F extends (...args: infer Args) => Observable<infer Value>
		? (...args: Args) => Observable<Value>
		: never
	: Definition extends { readonly kind: "observable" }
		? F extends Observable<infer Value>
			? Observable<Value>
			: never
		: F extends (...args: infer Args) => infer Result
			? Definition extends { readonly cancelable: true }
				? Args extends [...infer Parameters, AbortSignal]
					? (
							...args: [...Parameters, signal: AbortSignal | undefined]
						) => Promise<Awaited<Result>>
					: never
				: (...args: Args) => Promise<Awaited<Result>>
			: never;

export type RemoteService<T, Definitions extends RpcMemberDefinitions<T>> = {
	readonly [K in Extract<
		SelectedMemberKey<Definitions>,
		RemoteMemberKey<T>
	>]: RemoteMember<T[K], DefinitionFor<Definitions, K>>;
} & { readonly then?: never };

export type RemoteServiceImplementation<
	T,
	Definitions extends RpcMemberDefinitions<T>,
> = {
	[K in Extract<SelectedMemberKey<Definitions>, RemoteMemberKey<T>>]-?: T[K];
};

export type RemoteServiceDescriptor<
	T,
	Definitions extends RpcMemberDefinitions<T>,
> = {
	readonly [REMOTE_SERVICE_DESCRIPTOR_TYPE]: (
		service: T,
		definitions: Definitions,
	) => readonly [T, Definitions];
};

export type RemoteServiceDescriptorOptions<
	T,
	Definitions extends RpcMemberDefinitions<T>,
> = Omit<
	Readonly<input<typeof remoteServiceDescriptorOptionsSchema>>,
	"members"
> & {
	readonly members: Definitions &
		ValidateMemberDefinitions<T, Definitions> &
		NonEmptyMemberDefinitions<Definitions>;
};

export type RemoteServiceDescriptorOptionsSnapshot = Readonly<
	output<typeof remoteServiceDescriptorOptionsSchema>
>;

export const rpcMemberDefinitionSchema = z
	.union([
		z.strictObject({ kind: z.literal("function") }),
		z.strictObject({
			kind: z.literal("function"),
			cancelable: z.literal(true),
		}),
		z.strictObject({ kind: z.literal("observable-function") }),
		z.strictObject({ kind: z.literal("observable") }),
	])
	.readonly();
export const rpcMemberNameSchema = rpcWireIdentifierSchema.refine(
	(memberName) => memberName !== "then",
);
export const rpcMemberDefinitionsSchema = z
	.preprocess(
		(value) => ({ source: value, entries: Object.entries(Object(value)) }),
		z.object({
			source: z.object({}),
			entries: z
				.array(z.tuple([rpcMemberNameSchema, rpcMemberDefinitionSchema]))
				.min(1),
		}),
	)
	.transform(({ entries }) => {
		const members = Object.create(null) as Record<string, RpcMemberDefinition>;
		for (const [memberName, definition] of entries)
			members[memberName] = definition;
		return members;
	})
	.readonly();
export const remoteServiceDescriptorOptionsSchema = z
	.strictObject({
		wireName: rpcWireIdentifierSchema,
		members: rpcMemberDefinitionsSchema,
	})
	.readonly();
