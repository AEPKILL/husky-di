/**
 * @overview Compile-time probes for Observable remote service descriptors.
 * @author AEPKILL
 * @created 2026-09-13 23:04:37
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { expectTypeOf, test } from "vitest";

import { createRemoteServiceDescriptor } from "../../src/index";

interface ObservableService {
	readonly updates$: Observable<number>;
	watch(filter: string): Observable<number>;
}

const IObservableService =
	createServiceIdentifier<ObservableService>("IObservableService");

const observableDescriptor = createRemoteServiceDescriptor(IObservableService, {
	wireName: "example.observable.v1",
	members: {
		watch: { kind: "observable-function" },
		updates$: { kind: "observable" },
	},
});

test("RPC-STREAM-001 infers Observable member descriptors", () => {
	expectTypeOf(observableDescriptor).not.toBeAny();
	expectTypeOf(observableDescriptor).not.toBeNever();
});

test("RPC-STREAM-001 rejects legacy methods descriptors", () => {
	createRemoteServiceDescriptor(IObservableService, {
		wireName: "example.observable-legacy.v1",
		// @ts-expect-error RPC-STREAM-001 removes the legacy methods route.
		members: { watch: { kind: "function" } },
	});
});

test("RPC-STREAM-001 rejects AsyncIterable stream declarations", () => {
	interface InvalidService {
		watch(): AsyncIterable<number>;
	}
	const IInvalidService =
		createServiceIdentifier<InvalidService>("IInvalidService");

	createRemoteServiceDescriptor(IInvalidService, {
		wireName: "example.observable-invalid.v1",
		// @ts-expect-error RPC-STREAM-001 permits RxJS Observable only.
		members: { watch: { kind: "observable-function" } },
	});
});

// RPC-STREAM-002

// RPC-STREAM-003

// RPC-STREAM-004

// RPC-STREAM-005

// RPC-STREAM-006

// RPC-STREAM-007
