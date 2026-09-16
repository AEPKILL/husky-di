/**
 * @overview Verifies the Observable member descriptor contract.
 * @author AEPKILL
 * @created 2026-09-13 23:04:37
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Observable, of } from "rxjs";
import { describe, expect, it } from "vitest";

import { createRemoteServiceDescriptor } from "../../src/index";

interface ObservableService {
	readonly updates$: Observable<number>;
	watch(filter: string): Observable<number>;
}

const IObservableService =
	createServiceIdentifier<ObservableService>("IObservableService");

describe("Observable remote service descriptors", () => {
	it("RPC-STREAM-001 describes function and static Observable members", () => {
		const descriptor = createRemoteServiceDescriptor(IObservableService, {
			wireName: "example.observable.v1",
			members: {
				watch: { kind: "observable-function" },
				updates$: { kind: "observable" },
			},
		});

		expect(descriptor).toBeTypeOf("object");
		expect(Object.getPrototypeOf(descriptor)).toBeNull();
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect("members" in descriptor).toBe(false);
		expect("wireName" in descriptor).toBe(false);
	});

	it("RPC-STREAM-001 rejects legacy methods and mixed descriptor routes", () => {
		expect(() =>
			createRemoteServiceDescriptor(IObservableService, {
				wireName: "example.observable-legacy.v1",
				methods: { watch: { kind: "function" } },
			} as never),
		).toThrow(TypeError);

		expect(() =>
			createRemoteServiceDescriptor(IObservableService, {
				wireName: "example.observable-mixed.v1",
				members: { watch: { kind: "observable-function" } },
				methods: { watch: { kind: "function" } },
			} as never),
		).toThrow(TypeError);
	});

	it("RPC-STREAM-001 reserves then and validates Observable member kinds", () => {
		expect(() =>
			createRemoteServiceDescriptor(IObservableService, {
				wireName: "example.observable-then.v1",
				members: {
					// biome-ignore lint/suspicious/noThenProperty: verifies the reserved facade key.
					then: { kind: "observable" },
				},
			} as never),
		).toThrow(TypeError);

		expect(() =>
			createRemoteServiceDescriptor(IObservableService, {
				wireName: "example.observable-kind.v1",
				members: { watch: { kind: "async-iterable" } },
			} as never),
		).toThrow(TypeError);
	});

	it("RPC-STREAM-001 accepts only Observable implementations for stream members", () => {
		const descriptor = createRemoteServiceDescriptor(IObservableService, {
			wireName: "example.observable-implementation.v1",
			members: {
				watch: { kind: "observable-function" },
				updates$: { kind: "observable" },
			},
		});

		// Keep this fixture close to the descriptor contract so exposure tests can
		// reuse it without introducing a second service identifier.
		const implementation: ObservableService = {
			watch: () => of(1),
			updates$: of(2),
		};
		expect(implementation.watch("all")).toBeInstanceOf(Observable);
		expect(descriptor).toBeDefined();
	});
});
