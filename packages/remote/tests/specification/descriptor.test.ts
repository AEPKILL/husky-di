/**
 * @overview Verifies the explicit Remote Observable member descriptor contract.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { createServiceIdentifier } from "@husky-di/core";
import type { Observable } from "rxjs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	type RemoteServiceDescriptor,
} from "../../src/index";

interface Service {
	add(left: number, right: number): number;
	cancel(value: string, signal: AbortSignal): Promise<string>;
	readonly updates$: Observable<number>;
	watch(filter: string): Observable<number>;
}
const IService = createServiceIdentifier<Service>("IService");

describe("Remote Service Descriptor", () => {
	it("RPC-DESC-001 RPC-STREAM-001 creates an opaque members descriptor", () => {
		const descriptor = createRemoteServiceDescriptor(IService, {
			wireName: "example.service.v2",
			members: {
				add: { kind: "function" },
				cancel: { kind: "function", cancelable: true },
				watch: { kind: "observable-function" },
				updates$: { kind: "observable" },
			},
		});
		expectTypeOf(descriptor).toEqualTypeOf<
			RemoteServiceDescriptor<
				Service,
				{
					readonly add: { readonly kind: "function" };
					readonly cancel: {
						readonly kind: "function";
						readonly cancelable: true;
					};
					readonly watch: { readonly kind: "observable-function" };
					readonly updates$: { readonly kind: "observable" };
				}
			>
		>();
		expect(Object.getPrototypeOf(descriptor)).toBeNull();
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect("members" in descriptor).toBe(false);
		expect("then" in descriptor).toBe(false);
	});

	it("RPC-STREAM-001 rejects legacy, reserved, and invalid definitions", () => {
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.legacy.v1",
				methods: { add: true },
			} as never),
		).toThrow(TypeError);
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.then.v1",
				members: {
					// biome-ignore lint/suspicious/noThenProperty: verifies reserved facade key.
					then: { kind: "observable" },
				},
			} as never),
		).toThrow(TypeError);
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.invalid.v1",
				members: { watch: { kind: "async-iterable" } },
			} as never),
		).toThrow(TypeError);
	});

	it("RPC-DESC-002 RPC-DESC-003 rejects legacy method definitions and reserves then", () => {
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.legacy.v1",
				methods: { add: true },
			} as never),
		).toThrow(TypeError);
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.then.v1",
				members: {
					// biome-ignore lint/suspicious/noThenProperty: verifies reserved facade key.
					then: { kind: "function" },
				},
			} as never),
		).toThrow(TypeError);
	});

	it("RPC-DESC-002 RPC-DESC-003 preserves an own __proto__ member", () => {
		const members = Object.create(null) as Record<string, unknown>;
		members.__proto__ = { kind: "function" };
		expect(() =>
			createRemoteServiceDescriptor(IService, {
				wireName: "example.proto.v1",
				members,
			} as never),
		).not.toThrow();
	});
});
