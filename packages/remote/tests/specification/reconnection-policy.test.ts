/**
 * @overview Verifies reconnection policy.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcConnector,
} from "../../src/index";
import {
	captureThrownError,
	createSuccessfulConnectorAdapter,
	expectSchemaFailureTypeError,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-001 RPC-RECONNECT-003 rejects malformed or unbounded Reconnection policy", () => {
		const connector = createRpcConnector();
		const adapterFactory = () => createSuccessfulConnectorAdapter();
		const invalidPolicies = [
			{ retryDelaysMs: [-1] },
			{ retryDelaysMs: [1.5] },
			{ retryDelaysMs: new Array<number>(1) },
			{ retryDelaysMs: Array.from({ length: 65 }, () => 0) },
			{ attemptTimeoutMs: 0 },
			{ attemptTimeoutMs: Number.MAX_SAFE_INTEGER + 1 },
		];

		for (const policy of invalidPolicies) {
			expectSchemaFailureTypeError(
				captureThrownError(() =>
					createRpcConnectorReconnection({
						connector,
						adapterFactory,
						policy,
					}),
				),
			);
		}
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory,
					policy: { unknown: true } as never,
				}),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector: {} as never,
					adapterFactory,
				}),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory,
					unknown: true,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory,
					["__proto__"]: true,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory,
					policy: { ["__proto__"]: true },
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory: {} as never,
				}),
			),
		);
	});

	it("RPC-RECONNECT-001 RPC-RECONNECT-003 parses ordinary Reconnection configuration objects", () => {
		const metadata = Symbol("metadata");
		const reads: string[] = [];
		const connector = createRpcConnector();
		const retryDelaysMs = [0];
		Object.defineProperty(retryDelaysMs, "0", {
			enumerable: true,
			get() {
				reads.push("policy.retryDelaysMs[0]");
				return 0;
			},
		});
		const policy = new (class {
			readonly [metadata] = true;

			get retryDelaysMs(): readonly number[] {
				reads.push("policy.retryDelaysMs");
				return retryDelaysMs;
			}

			get attemptTimeoutMs(): number {
				reads.push("policy.attemptTimeoutMs");
				return 100;
			}
		})();
		let adapterFactoryCalls = 0;
		const adapterFactory = () => {
			adapterFactoryCalls += 1;
			return createSuccessfulConnectorAdapter();
		};
		const options = new (class {
			readonly [metadata] = true;

			get connector(): IRpcConnector {
				reads.push("options.connector");
				return connector;
			}

			get adapterFactory(): typeof adapterFactory {
				reads.push("options.adapterFactory");
				return adapterFactory;
			}

			get policy(): typeof policy {
				reads.push("options.policy");
				return policy;
			}
		})();

		const reconnection = createRpcConnectorReconnection(options);

		expect(reconnection.connector).toBe(connector);
		expect(adapterFactoryCalls).toBe(0);
		expect(reads).toEqual(
			expect.arrayContaining([
				"options.connector",
				"options.adapterFactory",
				"options.policy",
				"policy.retryDelaysMs",
				"policy.retryDelaysMs[0]",
				"policy.attemptTimeoutMs",
			]),
		);

		const callableStateSource = Object.assign(() => undefined, {
			subscribe: () => ({ unsubscribe() {} }),
		});
		expect(() =>
			createRpcConnectorReconnection({
				connector: {
					connect: async () => {},
					state: {},
					state$: callableStateSource,
					peer: { state: {}, state$: callableStateSource },
				} as never,
				adapterFactory,
			}),
		).not.toThrow();
	});

	it("RPC-RECONNECT-003 rejects an oversized delay list before reading its items", () => {
		const connector = createRpcConnector();
		const retryDelaysMs = Array.from({ length: 65 }, () => 0);
		let itemReads = 0;
		Object.defineProperty(retryDelaysMs, "0", {
			enumerable: true,
			get() {
				itemReads += 1;
				throw new Error(
					"Oversized lists must be rejected before item parsing.",
				);
			},
		});

		expect(() =>
			createRpcConnectorReconnection({
				connector,
				adapterFactory: createSuccessfulConnectorAdapter,
				policy: { retryDelaysMs },
			}),
		).toThrow(TypeError);
		expect(itemReads).toBe(0);
	});

	it("RPC-RECONNECT-003 snapshots retry delays without invoking a caller iterator", () => {
		const connector = createRpcConnector();
		const retryDelaysMs: number[] = [];
		let iteratorCalls = 0;
		Object.defineProperty(retryDelaysMs, Symbol.iterator, {
			value() {
				iteratorCalls += 1;
				throw new Error("The caller iterator must not run.");
			},
		});

		expect(() =>
			createRpcConnectorReconnection({
				connector,
				adapterFactory: createSuccessfulConnectorAdapter,
				policy: { retryDelaysMs },
			}),
		).not.toThrow();
		expect(iteratorCalls).toBe(0);
	});
});
