/**
 * @overview Compile-time probes for explicit Remote Observable member descriptors.
 * @author AEPKILL
 * @created 2026-08-26 15:07:19
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { expectTypeOf, test } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcConnector,
	type RemoteServiceDescriptor,
} from "../../src/index";

interface Service {
	add(left: number, right: number): number;
	updates$: Observable<number>;
	watch(filter: string): Observable<number>;
}
const IService = createServiceIdentifier<Service>("IService");
const descriptor = createRemoteServiceDescriptor(IService, {
	wireName: "example.service.v2",
	members: {
		add: { kind: "function" },
		updates$: { kind: "observable" },
		watch: { kind: "observable-function" },
	},
});

test("RPC-DESC-001 RPC-STREAM-001 infers members and kinds", () => {
	expectTypeOf(descriptor).toEqualTypeOf<
		RemoteServiceDescriptor<
			Service,
			{
				readonly add: { readonly kind: "function" };
				readonly updates$: { readonly kind: "observable" };
				readonly watch: { readonly kind: "observable-function" };
			}
		>
	>();
	const remote = createRpcConnector().peer.resolve(descriptor);
	expectTypeOf(remote.add).toEqualTypeOf<
		(left: number, right: number) => Promise<number>
	>();
	expectTypeOf(remote.watch).toEqualTypeOf<
		(filter: string) => Observable<number>
	>();
	expectTypeOf(remote.updates$).toEqualTypeOf<Observable<number>>();
	expectTypeOf(remote.then).toEqualTypeOf<undefined>();
	// @ts-expect-error RPC-STREAM-001 a mutable source property becomes readonly remotely.
	remote.updates$ = null as unknown as Observable<number>;
});

test("RPC-STREAM-001 rejects promised streams, stream signals, and mismatched member kinds", () => {
	interface UnsupportedService {
		promised(): Promise<Observable<number>>;
		cancelable(signal: AbortSignal): Observable<number>;
		ordinary(): number;
		updates$: Observable<number>;
	}
	const identifier = createServiceIdentifier<UnsupportedService>(
		"IUnsupportedStreamService",
	);
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.promised-stream.v2",
		// @ts-expect-error RPC-STREAM-001 methods return Observable directly.
		members: { promised: { kind: "observable-function" } },
	});
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.promised-unary.v2",
		// @ts-expect-error RPC-STREAM-001 promised Observables are not unary values either.
		members: { promised: { kind: "function" } },
	});
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.signal-stream.v2",
		// @ts-expect-error RPC-STREAM-001 stream cancellation uses unsubscribe.
		members: { cancelable: { kind: "observable-function" } },
	});
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.ordinary-stream.v2",
		// @ts-expect-error RPC-STREAM-001 ordinary results cannot declare a stream.
		members: { ordinary: { kind: "observable-function" } },
	});
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.function-property.v2",
		// @ts-expect-error RPC-STREAM-001 static Observable members are non-functions.
		members: { ordinary: { kind: "observable" } },
	});
	createRemoteServiceDescriptor(identifier, {
		wireName: "example.property-function.v2",
		// @ts-expect-error RPC-STREAM-001 static Observable values are not methods.
		members: { updates$: { kind: "observable-function" } },
	});
});

createRemoteServiceDescriptor(IService, {
	wireName: "example.legacy.v1",
	// @ts-expect-error RPC-STREAM-001 removes methods.
	methods: { add: true },
});

interface InvalidService {
	watch(): AsyncIterable<number>;
}
const IInvalid = createServiceIdentifier<InvalidService>("IInvalid");
createRemoteServiceDescriptor(IInvalid, {
	wireName: "example.invalid.v1",
	// @ts-expect-error RPC-STREAM-001 permits RxJS Observable only.
	members: { watch: { kind: "observable-function" } },
});

interface InvalidUnary {
	value: string;
}
const IInvalidUnary = createServiceIdentifier<InvalidUnary>("IInvalidUnary");
createRemoteServiceDescriptor(IInvalidUnary, {
	wireName: "example.invalid-unary.v1",
	// @ts-expect-error RPC-DESC-002 exposes callable members only.
	members: { value: { kind: "function" } },
});

interface InvalidStream {
	watch(): AsyncIterable<number>;
}
const IInvalidStream = createServiceIdentifier<InvalidStream>("IInvalidStream");
createRemoteServiceDescriptor(IInvalidStream, {
	wireName: "example.invalid-stream.v1",
	// @ts-expect-error RPC-DESC-002 rejects AsyncIterable results.
	members: { watch: { kind: "observable-function" } },
});
