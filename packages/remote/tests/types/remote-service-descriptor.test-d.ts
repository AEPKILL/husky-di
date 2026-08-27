/**
 * @overview Compile-time Remote Service Descriptor specification probes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { expectTypeOf, test } from "vitest";

import {
	createRemoteServiceDescriptor,
	type IRemoteServiceDescriptor,
} from "../../src/index";

interface ValidService {
	add(left: number, right: number): number;
	cancel(value: string, signal: AbortSignal): Promise<string>;
	optional(value?: string): string;
	join(...values: string[]): string;
	readonly version: string;
}

interface InvalidService {
	// biome-ignore lint/suspicious/noExplicitAny: proves untyped wire parameters are rejected.
	anyParameter(value: any): string;
	// biome-ignore lint/suspicious/noExplicitAny: proves untyped wire results are rejected.
	anyResult(): any;
	observable(): Observable<string>;
	iterable(): AsyncIterable<string>;
	optionalSignal(signal?: AbortSignal): void;
	signalFirst(signal: AbortSignal, value: string): void;
	ordinary(value: string): void;
	then(): void;
}

interface OtherService {
	add(left: number, right: number): number;
}

const IValidService = createServiceIdentifier<ValidService>("IValidService");
const IInvalidService =
	createServiceIdentifier<InvalidService>("IInvalidService");

const validDescriptor = createRemoteServiceDescriptor(IValidService, {
	wireName: "example.valid.v1",
	methods: {
		add: true,
		cancel: { cancelable: true },
		optional: true,
		join: true,
	},
});

test("RPC-DESC-001 infers the exact selected service definition", () => {
	expectTypeOf(validDescriptor).toEqualTypeOf<
		IRemoteServiceDescriptor<
			ValidService,
			{
				readonly add: true;
				readonly cancel: { readonly cancelable: true };
				readonly optional: true;
				readonly join: true;
			}
		>
	>();
});

test("RPC-DESC-002 rejects invalid method definitions", () => {
	createRemoteServiceDescriptor(IValidService, {
		wireName: "example.empty.v1",
		// @ts-expect-error RPC-DESC-002 requires a non-empty allowlist.
		methods: {},
	});

	createRemoteServiceDescriptor(IValidService, {
		wireName: "example.property.v1",
		// @ts-expect-error RPC-DESC-002 allows methods, not data properties.
		methods: {
			version: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.then.v1",
		// @ts-expect-error RPC-DESC-002 reserves then.
		methods: {
			// biome-ignore lint/suspicious/noThenProperty: verifies the reserved method is rejected.
			then: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.any-parameter.v1",
		// @ts-expect-error RPC-DESC-002 rejects any parameters.
		methods: {
			anyParameter: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.any-result.v1",
		// @ts-expect-error RPC-DESC-002 rejects any results.
		methods: {
			anyResult: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.observable.v1",
		// @ts-expect-error RPC-DESC-002 rejects Observable results.
		methods: {
			observable: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.iterable.v1",
		// @ts-expect-error RPC-DESC-002 rejects AsyncIterable results.
		methods: {
			iterable: true,
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.optional-signal.v1",
		// @ts-expect-error RPC-DESC-002 requires an exact trailing AbortSignal.
		methods: {
			optionalSignal: { cancelable: true },
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.signal-first.v1",
		// @ts-expect-error RPC-DESC-002 requires AbortSignal to be final.
		methods: {
			signalFirst: { cancelable: true },
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.ordinary-cancel.v1",
		// @ts-expect-error RPC-DESC-002 cannot mark a signal-free method cancelable.
		methods: {
			ordinary: { cancelable: true },
		},
	});

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.signal-as-ordinary.v1",
		// @ts-expect-error RPC-DESC-002 cannot expose a signal method as ordinary unary.
		methods: {
			signalFirst: true,
		},
	});
});

const IOtherService = createServiceIdentifier<OtherService>("IOtherService");
const otherDescriptor = createRemoteServiceDescriptor(IOtherService, {
	wireName: "example.other.v1",
	methods: { add: true },
});

const addOnlyDescriptor = createRemoteServiceDescriptor(IValidService, {
	wireName: "example.add-only.v1",
	methods: { add: true },
});

test("RPC-DESC-001 keeps Descriptor type parameters invariant", () => {
	expectTypeOf(otherDescriptor).not.toMatchTypeOf<typeof validDescriptor>();
	expectTypeOf(addOnlyDescriptor).not.toMatchTypeOf<typeof validDescriptor>();
});

test("RPC-PKG-009 keeps conditional helper types private", () => {
	// biome-ignore format: keeps the missing-export diagnostic on the expected line.
	// @ts-expect-error RPC-PKG-009 does not export conditional helper types.
	type MissingRpcMethodDefinitions = import("../../src/index").RpcMethodDefinitions;
	void (null as unknown as MissingRpcMethodDefinitions);
});
