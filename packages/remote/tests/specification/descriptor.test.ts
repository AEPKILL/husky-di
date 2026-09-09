/**
 * @overview Verifies descriptor.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, expectTypeOf, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcConnector,
	type RemoteServiceDescriptor,
} from "../../src/index";
import {
	type CalculatorService,
	captureThrownError,
	expectSchemaFailureTypeError,
	ICalculatorService,
	ICaseSensitiveService,
} from "./test.utils";

describe("Remote Service Descriptor", () => {
	it("RPC-DESC-001 creates an opaque Descriptor from local and wire identities", () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: {
				add: true,
				cancel: { cancelable: true },
			},
		});

		expectTypeOf(descriptor).toEqualTypeOf<
			RemoteServiceDescriptor<
				CalculatorService,
				{
					readonly add: true;
					readonly cancel: { readonly cancelable: true };
				}
			>
		>();
		expect(descriptor).toBeTypeOf("object");
		expect("serviceIdentifier" in descriptor).toBe(false);
		expect("wireName" in descriptor).toBe(false);
		expect("methods" in descriptor).toBe(false);
	});

	it("RPC-DESC-002 RPC-DESC-003 parses ordinary Descriptor configuration objects", () => {
		const metadata = Symbol("metadata");
		const reads: string[] = [];
		const cancelableDefinition = new (class {
			constructor() {
				Object.defineProperty(this, metadata, { value: true });
			}

			get cancelable(): true {
				reads.push("methods.cancel.cancelable");
				return true;
			}
		})();
		const methods = new (class {
			constructor() {
				Object.defineProperty(this, metadata, { value: true });
				Object.defineProperty(this, "add", {
					enumerable: true,
					get: () => {
						reads.push("methods.add");
						return true;
					},
				});
				Object.defineProperty(this, "cancel", {
					enumerable: true,
					get: () => cancelableDefinition,
				});
			}

			declare readonly add: true;
			declare readonly cancel: typeof cancelableDefinition;
		})();
		const options = new (class {
			readonly [metadata] = true;

			get wireName(): string {
				reads.push("options.wireName");
				return "example.ordinary.v1";
			}

			get methods(): typeof methods {
				reads.push("options.methods");
				return methods;
			}
		})();

		expect(() =>
			createRemoteServiceDescriptor(ICalculatorService, options),
		).not.toThrow();
		expect(reads).toEqual(
			expect.arrayContaining([
				"options.wireName",
				"options.methods",
				"methods.add",
				"methods.cancel.cancelable",
			]),
		);
	});

	it("RPC-DESC-002 RPC-DESC-003 preserves the exact __proto__ method name", () => {
		const methods = Object.create(null) as Record<string, true>;
		methods.__proto__ = true;
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.prototype.v1",
			methods,
		} as never);
		const connector = createRpcConnector();

		expect(() =>
			connector.peer.expose(descriptor, Object.create(null)),
		).toThrow("Selected implementation member __proto__ is missing.");
	});

	it.each([
		["an empty wire name", { wireName: "", methods: { add: true } }],
		["an empty allowlist", { wireName: "example.calculator.v1", methods: {} }],
		[
			"an empty method name",
			{ wireName: "example.calculator.v1", methods: { "": true } },
		],
		[
			"the reserved then method",
			{
				wireName: "example.calculator.v1",
				methods: {
					// biome-ignore lint/suspicious/noThenProperty: verifies the reserved method rejection.
					then: true,
				},
			},
		],
		[
			"an invalid method definition",
			{ wireName: "example.calculator.v1", methods: { add: false } },
		],
		[
			"an unknown __proto__ method definition member",
			{
				wireName: "example.calculator.v1",
				methods: {
					add: { cancelable: true, ["__proto__"]: false },
				},
			},
		],
	])("RPC-DESC-002 RPC-DESC-003 rejects %s", (_label, options) => {
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRemoteServiceDescriptor(
					ICalculatorService,
					options as unknown as {
						readonly wireName: string;
						readonly methods: { readonly add: true };
					},
				),
			),
		);
	});

	it("RPC-DESC-003 compares the reserved method name exactly", () => {
		expect(() =>
			createRemoteServiceDescriptor(ICaseSensitiveService, {
				wireName: "example.case-sensitive.v1",
				methods: { Then: true },
			}),
		).not.toThrow();
	});
});
