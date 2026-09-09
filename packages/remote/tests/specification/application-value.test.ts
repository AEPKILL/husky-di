/**
 * @overview Verifies application value.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import { createRpcConnector } from "../../src/index";
import { createProtocolHarness } from "./test.utils";

describe("Application Value normalization", () => {
	it("RPC-VALUE-001 RPC-VALUE-002 RPC-VALUE-005 creates a detached frozen snapshot with deterministic weight", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const input = { b: [1, true], a: null };

		const snapshot =
			harness.connectorHosts[0]?.normalizeApplicationValue(input);
		input.b[0] = 2;

		expect(snapshot?.value).toEqual({ b: [1, true], a: null });
		expect(snapshot?.value).not.toBe(input);
		expect(snapshot?.weight).toBe(23);
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot?.value)).toBe(true);
		if (
			snapshot === undefined ||
			typeof snapshot.value !== "object" ||
			snapshot.value === null ||
			Array.isArray(snapshot.value)
		) {
			throw new Error("Expected a record snapshot.");
		}
		expect(
			Object.isFrozen((snapshot.value as { readonly b: readonly unknown[] }).b),
		).toBe(true);
	});

	it("RPC-VALUE-001 RPC-VALUE-002 rejects unsupported shapes without invoking user accessors", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const normalize = (value: unknown) =>
			harness.connectorHosts[0]?.normalizeApplicationValue(value);
		let getterCalls = 0;
		let toJsonCalls = 0;
		const accessor = Object.defineProperty({}, "value", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return 1;
			},
		});
		const withToJson = {
			toJSON() {
				toJsonCalls += 1;
				return null;
			},
		};
		const sparse = Array.from({ length: 2 });
		const extraArrayProperty: unknown[] = [];
		Object.defineProperty(extraArrayProperty, "extra", {
			enumerable: false,
			value: 1,
		});
		const symbolRecord = { value: 1 };
		Object.defineProperty(symbolRecord, Symbol("hidden"), { value: 1 });
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		class DomainValue {
			readonly value = 1;
		}
		const bigintValue = (
			globalThis as unknown as {
				readonly BigInt: (value: number) => unknown;
			}
		).BigInt(1);

		for (const value of [
			undefined,
			bigintValue,
			Symbol("value"),
			() => undefined,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			-0,
			new Date(0),
			new Map(),
			new Set(),
			new DomainValue(),
			new Uint8Array([1]),
			sparse,
			extraArrayProperty,
			symbolRecord,
			cycle,
			accessor,
			withToJson,
			"\ud800",
		]) {
			expect(() => normalize(value)).toThrow(TypeError);
		}

		expect(getterCalls).toBe(0);
		expect(toJsonCalls).toBe(0);
	});

	it("RPC-VALUE-002 ignores non-enumerable record data and converts Proxy trap failure to TypeError", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const record = { visible: 1 };
		Object.defineProperty(record, "hidden", { value: 2 });

		expect(
			harness.connectorHosts[0]?.normalizeApplicationValue(record).value,
		).toEqual({ visible: 1 });

		const trapped = new Proxy(
			{},
			{
				ownKeys() {
					throw new Error("trap failed");
				},
			},
		);
		expect(() =>
			harness.connectorHosts[0]?.normalizeApplicationValue(trapped),
		).toThrow(TypeError);

		let ordinaryGets = 0;
		const proxiedArray = new Proxy([1], {
			get() {
				ordinaryGets += 1;
				throw new Error("ordinary property access is forbidden");
			},
		});
		expect(
			harness.connectorHosts[0]?.normalizeApplicationValue(proxiedArray).value,
		).toEqual([1]);
		expect(ordinaryGets).toBe(0);
	});

	it("RPC-VALUE-004 RPC-VALUE-005 fixes argument roots and compact-JSON weights", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const host = harness.connectorHosts[0];
		if (host === undefined) {
			throw new Error("Expected the Connector Protocol host.");
		}

		expect(host.normalizeApplicationArguments([1, "value"]).value).toEqual([
			1,
			"value",
		]);
		expect(() => host.normalizeApplicationArguments({ 0: 1 })).toThrow(
			TypeError,
		);
		expect(host.normalizeApplicationValue(null).weight).toBe(4);
		expect(host.normalizeApplicationValue("é\n").weight).toBe(6);
		expect(host.normalizeApplicationValue("\u0000").weight).toBe(8);
		expect(host.normalizeApplicationValue("/").weight).toBe(3);
		expect(host.normalizeApplicationValue(1e20).weight).toBe(21);
		expect(host.normalizeApplicationValue(1e21).weight).toBe(5);
		expect(host.normalizeApplicationValue({ a: 1, b: true }).weight).toBe(
			host.normalizeApplicationValue({ b: true, a: 1 }).weight,
		);
	});

	it("RPC-VALUE-006 compares normalized semantic values instead of identity or member order", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const host = harness.connectorHosts[0];
		if (host === undefined) {
			throw new Error("Expected the Connector Protocol host.");
		}
		const left = host.normalizeApplicationValue({
			a: [1, { value: "same" }],
			b: true,
		});
		const rightInput = Object.assign(Object.create(null), {
			b: true,
			a: [1, { value: "same" }],
		});
		const right = host.normalizeApplicationValue(rightInput);

		expect(host.applicationValuesEqual(left, right)).toBe(true);
		expect(
			host.applicationValuesEqual(
				left,
				host.normalizeApplicationValue({
					a: [{ value: "same" }, 1],
					b: true,
				}),
			),
		).toBe(false);
		expect(
			host.applicationValuesEqual(
				left,
				host.normalizeApplicationValue({
					a: [1, { value: "different" }],
					b: true,
				}),
			),
		).toBe(false);
	});

	it("RPC-VALUE-004 accepts every fixed limit and rejects the next value", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		const normalize = (value: unknown) =>
			harness.connectorHosts[0]?.normalizeApplicationValue(value);
		const nested = (depth: number): unknown => {
			let value: unknown = null;
			for (let index = 1; index < depth; index += 1) {
				value = [value];
			}
			return value;
		};
		const recordWithMembers = (count: number): Record<string, null> => {
			const value = Object.create(null) as Record<string, null>;
			for (let index = 0; index < count; index += 1) {
				value[`key${index}`] = null;
			}
			return value;
		};
		const valueWithNodes = (
			lastArrayLength: number,
		): Record<string, null[]> => {
			const value = Object.create(null) as Record<string, null[]>;
			for (let index = 0; index < 1024; index += 1) {
				value[`key${index}`] = Array.from(
					{ length: index === 1023 ? lastArrayLength : 63 },
					() => null,
				);
			}
			return value;
		};

		expect(() => normalize(nested(64))).not.toThrow();
		expect(() => normalize(nested(65))).toThrow(TypeError);
		expect(() => normalize("a".repeat(524_288))).not.toThrow();
		expect(() => normalize("a".repeat(524_289))).toThrow(TypeError);
		expect(() => normalize({ ["a".repeat(256)]: null })).not.toThrow();
		expect(() => normalize({ ["a".repeat(257)]: null })).toThrow(TypeError);
		expect(() => normalize(recordWithMembers(1024))).not.toThrow();
		expect(() => normalize(recordWithMembers(1025))).toThrow(TypeError);
		expect(() =>
			normalize(Array.from({ length: 8192 }, () => null)),
		).not.toThrow();
		expect(() => normalize(Array.from({ length: 8193 }, () => null))).toThrow(
			TypeError,
		);
		expect(() => normalize(valueWithNodes(62))).not.toThrow();
		expect(() => normalize(valueWithNodes(63))).toThrow(TypeError);
		expect(() =>
			normalize(["a".repeat(500_000), "b".repeat(499_993)]),
		).not.toThrow();
		expect(() => normalize(["a".repeat(500_000), "b".repeat(499_994)])).toThrow(
			TypeError,
		);
	});
});
