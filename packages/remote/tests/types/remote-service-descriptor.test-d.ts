/**
 * @overview Public descriptor factory inference and private-surface regression coverage.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import {
	createServiceIdentifier,
	type ServiceIdentifier,
} from "@husky-di/core";
import { expectTypeOf, test } from "vitest";
import type * as remote from "../../src/index";
import {
	createRemoteServiceDescriptor,
	type RemoteService,
	type RemoteServiceDescriptor,
} from "../../src/index";

test("RPC-DESC-007: preserves the public factory's allowlist and cancellation inference", () => {
	type Service = {
		query(value: string, signal: AbortSignal): Promise<number>;
		optional?(): void;
	};
	const IService = createServiceIdentifier<Service>("Service");
	const descriptor = createRemoteServiceDescriptor(IService, {
		wireName: "service",
		methods: { query: { cancelable: true } },
	});

	expectTypeOf(descriptor).toEqualTypeOf<
		RemoteServiceDescriptor<
			Service,
			{ readonly query: { readonly cancelable: true } }
		>
	>();
	expectTypeOf<
		RemoteService<Service, { query: { cancelable: true } }>["query"]
	>().toEqualTypeOf<
		(value: string, signal: AbortSignal | undefined) => Promise<number>
	>();

	createRemoteServiceDescriptor(IService, {
		wireName: "service",
		// @ts-expect-error A caller must select at least one required method.
		methods: {},
	});
	createRemoteServiceDescriptor(IService, {
		wireName: "service",
		// @ts-expect-error Cancellation metadata is required for a method with a signal.
		methods: { query: true },
	});
	createRemoteServiceDescriptor(IService, {
		wireName: "service",
		// @ts-expect-error Optional methods cannot establish an allowlist contract.
		methods: { optional: true },
	});
	createRemoteServiceDescriptor(IService, {
		wireName: "service",
		// @ts-expect-error Method names must belong to the service contract.
		methods: { missing: true },
	});
});

test("RPC-DESC-007: exposes deeply readonly metadata even for mutable method definitions", () => {
	type Service = { query(signal: AbortSignal): number };
	type Definitions = { query: { cancelable: true } };
	const IService = createServiceIdentifier<Service>("Service");
	const methods: Definitions = { query: { cancelable: true } };
	const descriptor = createRemoteServiceDescriptor(IService, {
		wireName: "service",
		methods,
	});

	expectTypeOf(descriptor.serviceIdentifier).toEqualTypeOf<
		ServiceIdentifier<Service>
	>();
	expectTypeOf(descriptor.wireName).toBeString();
	expectTypeOf(descriptor.methods).toEqualTypeOf<{
		readonly query: { readonly cancelable: true };
	}>();
	// @ts-expect-error The service identifier reference is readonly.
	descriptor.serviceIdentifier = IService;
	// @ts-expect-error The wire name is readonly.
	descriptor.wireName = "changed";
	// @ts-expect-error The method map reference is readonly.
	descriptor.methods = methods;
	// @ts-expect-error Each selected method definition is readonly.
	descriptor.methods.query = { cancelable: true };
	// @ts-expect-error Nested cancellation metadata is readonly.
	descriptor.methods.query.cancelable = true;
	// @ts-expect-error The metadata exposes only selected method keys.
	descriptor.methods.missing;
});

test("RPC-DESC-007: keeps internal helpers, schemas and branding out of the public surface", () => {
	expectTypeOf<
		Extract<
			keyof typeof remote,
			| "getRemoteServiceDescriptorData"
			| "remoteServiceDescriptorOptionsSchema"
			| "REMOTE_SERVICE_DESCRIPTOR_TYPE"
		>
	>().toBeNever();
});
