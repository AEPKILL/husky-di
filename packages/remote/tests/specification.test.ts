/**
 * @overview Remote Service Descriptor specification and type regression tests.
 * @author AEPKILL
 * @created 2026-09-07 00:00:00
 */

import type { Observable } from "rxjs";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
	type RemoteMethodKey,
	type RemoteService,
	type RemoteServiceDescriptor,
	type RemoteServiceDescriptorOptions,
	type RemoteServiceDescriptorOptionsSnapshot,
	type RemoteServiceImplementation,
	type RpcMethodDefinitions,
	remoteServiceDescriptorOptionsSchema,
} from "../src/types/remote-service-descriptor.type";

describe("Remote Service Descriptor specification", () => {
	it("RPC-DESC-001: selects only required string methods and reserves then", () => {
		type Service = {
			query(): string;
			optional?(): string;
			then(): string;
			0(): string;
			[Symbol.iterator](): Iterator<string>;
			value: string;
		};

		expectTypeOf<RemoteMethodKey<Service>>().toEqualTypeOf<"query">();
		expectTypeOf<
			// biome-ignore lint/complexity/noBannedTypes: an empty object literal infers this allowlist type.
			RemoteServiceDescriptorOptions<Service, {}>["methods"]
		>().toBeNever();
		expectTypeOf<
			RemoteServiceDescriptorOptions<
				Service,
				RpcMethodDefinitions<Service>
			>["methods"]
		>().toBeNever();
	});

	it("RPC-DESC-001: rejects extra allowlist entries even on existing objects", () => {
		type Service = { query(): string };
		type Definitions = { query: true; then: true; missing: true };

		expectTypeOf<Definitions>().not.toMatchTypeOf<
			RemoteServiceDescriptorOptions<Service, Definitions>["methods"]
		>();
	});

	it("RPC-DESC-002: recognizes cancellation after an unknown parameter", () => {
		type Service = {
			query(data: unknown, signal: AbortSignal): Promise<string>;
		};
		type Definitions = { readonly query: { readonly cancelable: true } };
		const options: RemoteServiceDescriptorOptions<Service, Definitions> = {
			wireName: "query-service",
			methods: { query: { cancelable: true } },
		};

		expectTypeOf(options.methods).toMatchTypeOf<Definitions>();
		expectTypeOf<{ query: true }>().not.toMatchTypeOf<
			RpcMethodDefinitions<Service>
		>();
		expectTypeOf<RemoteService<Service, Definitions>["query"]>().toEqualTypeOf<
			(data: unknown, signal: AbortSignal | undefined) => Promise<string>
		>();
		expectTypeOf<
			RemoteServiceImplementation<Service, Definitions>["query"]
		>().toEqualTypeOf<Service["query"]>();
	});

	it("RPC-DESC-002: rejects misplaced and duplicate signals around unknown parameters", () => {
		type Service = {
			misplaced(signal: AbortSignal, data: unknown): string;
			duplicate(first: AbortSignal, data: unknown, last: AbortSignal): string;
			beforeRest(signal: AbortSignal, ...data: unknown[]): string;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly misplaced: never;
			readonly duplicate: never;
			readonly beforeRest: never;
		}>();
	});

	it("RPC-DESC-002: requires a fixed final slot of exactly AbortSignal", () => {
		type Service = {
			optional(signal?: AbortSignal): string;
			nullable(signal: AbortSignal | null): string;
			union(signal: AbortSignal | string): string;
			narrow(signal: AbortSignal & { readonly extra: true }): string;
			rest(...signals: AbortSignal[]): string;
			afterRest(...args: [...unknown[], AbortSignal]): string;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly optional: never;
			readonly nullable: never;
			readonly union: never;
			readonly narrow: never;
			readonly rest: never;
			readonly afterRest: never;
		}>();
	});

	it("RPC-DESC-002: accepts cancellation alone or after ordinary parameters", () => {
		type Service = {
			only(signal: AbortSignal): void;
			query(data: string, signal: AbortSignal): number;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly only: { readonly cancelable: true };
			readonly query: { readonly cancelable: true };
		}>();
	});

	it("RPC-DESC-003: preserves unary definitions for zero, optional and rest parameters", () => {
		type Service = {
			empty(): void;
			emptyRest(...args: []): string;
			query(value?: string): Promise<number>;
			collect(...values: unknown[]): number;
		};

		expectTypeOf<RpcMethodDefinitions<Service>>().toEqualTypeOf<{
			readonly empty?: true;
			readonly emptyRest?: true;
			readonly query?: true;
			readonly collect?: true;
		}>();
		expectTypeOf<
			RemoteService<Service, { query: true }>["query"]
		>().toEqualTypeOf<(value?: string) => Promise<number>>();
		expectTypeOf<keyof RemoteService<Service, { query: true }>>().toEqualTypeOf<
			"query" | "then"
		>();
	});

	it("RPC-DESC-003: rejects any parameters and unsupported awaited results", () => {
		type Service = {
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection of an unsafe parameter.
			unsafeParameter(value: any): string;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection before cancellation classification.
			unsafeCancellation(value: any, signal: AbortSignal): string;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection of an unsafe return type.
			unsafeResult(): any;
			// biome-ignore lint/suspicious/noExplicitAny: verify rejection after unwrapping a promise.
			unsafePromise(): Promise<any>;
			observable(): Observable<string>;
			iterable(): AsyncIterable<string>;
			promisedStream(): Promise<Observable<string>>;
			mixedResult(): string | AsyncIterable<string>;
		};

		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly unsafeParameter: never;
			readonly unsafeCancellation: never;
			readonly unsafeResult: never;
			readonly unsafePromise: never;
			readonly observable: never;
			readonly iterable: never;
			readonly promisedStream: never;
			readonly mixedResult: never;
		}>();
	});

	it("RPC-DESC-004: rejects extra cancellation metadata on existing objects", () => {
		type Service = { query(signal: AbortSignal): string };
		type Definitions = { query: { cancelable: true; extra: true } };

		expectTypeOf<Definitions>().not.toMatchTypeOf<
			RemoteServiceDescriptorOptions<Service, Definitions>["methods"]
		>();
	});

	it("RPC-DESC-004: parses method definitions into a detached frozen snapshot", () => {
		const source = {
			wireName: "query-service",
			methods: { query: true, cancel: { cancelable: true } },
		};
		const snapshot = remoteServiceDescriptorOptionsSchema.parse(source);

		expectTypeOf(
			snapshot,
		).toEqualTypeOf<RemoteServiceDescriptorOptionsSnapshot>();
		expectTypeOf(snapshot.methods).toEqualTypeOf<
			Readonly<Record<string, true | { readonly cancelable: true }>>
		>();
		expect(snapshot).toEqual({
			wireName: "query-service",
			methods: { query: true, cancel: { cancelable: true } },
		});
		expect(Object.getPrototypeOf(snapshot.methods)).toBeNull();
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.methods)).toBe(true);
		expect(Object.isFrozen(snapshot.methods.cancel)).toBe(true);

		source.methods.query = false;
		source.methods.cancel.cancelable = false;
		expect(snapshot.methods.query).toBe(true);
		expect(snapshot.methods.cancel).toEqual({ cancelable: true });
	});

	it.each([
		{},
		// biome-ignore lint/suspicious/noThenProperty: verify rejection of the reserved method name.
		{ then: true },
		{ query: false },
		{ query: { cancelable: false } },
		{ query: { cancelable: true, extra: true } },
	])("RPC-DESC-004: rejects invalid method metadata %j", (methods) => {
		expect(
			remoteServiceDescriptorOptionsSchema.safeParse({
				wireName: "query-service",
				methods,
			}).success,
		).toBe(false);
	});

	it("RPC-DESC-005: keeps descriptor service and allowlist parameters invariant", () => {
		type Service = { query(): string };
		type ExtendedService = Service & { extra(): string };
		type Descriptor = RemoteServiceDescriptor<Service, { query: true }>;
		type ExtendedDescriptor = RemoteServiceDescriptor<
			ExtendedService,
			{ query: true }
		>;
		type WidenedDescriptor = RemoteServiceDescriptor<
			Service,
			RpcMethodDefinitions<Service>
		>;

		expectTypeOf<Descriptor>().not.toMatchTypeOf<ExtendedDescriptor>();
		expectTypeOf<ExtendedDescriptor>().not.toMatchTypeOf<Descriptor>();
		expectTypeOf<Descriptor>().not.toMatchTypeOf<WidenedDescriptor>();
		expectTypeOf<WidenedDescriptor>().not.toMatchTypeOf<Descriptor>();
	});

	it("RPC-DESC-006: documents generic correlation loss in facade inference", () => {
		type Service = { identity<T>(value: T): T };

		expectTypeOf<
			RemoteService<Service, { identity: true }>["identity"]
		>().toEqualTypeOf<(value: unknown) => Promise<unknown>>();
	});

	it("RPC-DESC-006: uses the last overload for facade inference and validation", () => {
		type Service = {
			query(value: string): string;
			query(value: number): number;
			stream(value: string): string;
			stream(value: number): Observable<number>;
		};

		expectTypeOf<
			RemoteService<Service, { query: true }>["query"]
		>().toEqualTypeOf<(value: number) => Promise<number>>();
		expectTypeOf<Required<RpcMethodDefinitions<Service>>>().toEqualTypeOf<{
			readonly query: true;
			readonly stream: never;
		}>();
	});
});
