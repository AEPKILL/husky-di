/**
 * @overview Verifies reconnection policy.
 * @author AEPKILL
 * @created 2026-09-10 00:42:04
 */

import { describe, expect, it } from "vitest";
import {
	createRpcConnector,
	createRpcReconnectionConnector,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import {
	captureThrownError,
	createProtocolHarness,
	createSuccessfulConnectorAdapter,
	expectSchemaFailureTypeError,
} from "./test.utils";

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-001 validates configuration before constructing a Connector", () => {
		const harness = createProtocolHarness();
		const invalidOptions = [
			{ connector: createRpcConnector() },
			{ runtimePolicy: { unknown: true } },
			{ runtimePolicy: { maxPendingInvocationsPerSession: 0 } },
			{ interceptor: {} },
			{ adapterFactory: {} },
			{ policy: { attemptTimeoutMs: 0 } },
		];

		for (const invalid of invalidOptions) {
			expectSchemaFailureTypeError(
				captureThrownError(() =>
					createRpcReconnectionConnector({
						protocolFactory: harness.connectorFactory,
						adapterFactory: createSuccessfulConnectorAdapter,
						...invalid,
					} as never),
				),
			);
		}
		expect(harness.connectorHosts).toHaveLength(0);
	});

	it("RPC-RECONNECT-001 RPC-RECONNECT-003 rejects malformed or unbounded Reconnection policy", () => {
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
					createRpcReconnectionConnector({
						adapterFactory,
						policy,
					}),
				),
			);
		}
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					adapterFactory,
					policy: { unknown: true } as never,
				}),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					connector: createRpcConnector(),
					adapterFactory,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					adapterFactory,
					unknown: true,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					adapterFactory,
					["__proto__"]: true,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					adapterFactory,
					policy: { ["__proto__"]: true },
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcReconnectionConnector({
					adapterFactory: {} as never,
				}),
			),
		);
	});

	it("RPC-RECONNECT-001 RPC-RECONNECT-003 parses ordinary Reconnection configuration objects", () => {
		const metadata = Symbol("metadata");
		const reads: string[] = [];
		const harness = createProtocolHarness();
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

			get protocolFactory(): RpcProtocolConnectorFactory {
				reads.push("options.protocolFactory");
				return harness.connectorFactory;
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

		const reconnection = createRpcReconnectionConnector(options);

		expect(reconnection.connector.peer.state.status).toBe("unbound");
		expect(harness.connectorHosts).toHaveLength(1);
		expect(adapterFactoryCalls).toBe(0);
		expect(reads).toEqual(
			expect.arrayContaining([
				"options.protocolFactory",
				"options.adapterFactory",
				"options.policy",
				"policy.retryDelaysMs",
				"policy.retryDelaysMs[0]",
				"policy.attemptTimeoutMs",
			]),
		);
	});

	it("RPC-RECONNECT-003 rejects an oversized delay list before reading its items", () => {
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
			createRpcReconnectionConnector({
				adapterFactory: createSuccessfulConnectorAdapter,
				policy: { retryDelaysMs },
			}),
		).toThrow(TypeError);
		expect(itemReads).toBe(0);
	});

	it("RPC-RECONNECT-003 snapshots retry delays without invoking a caller iterator", () => {
		const retryDelaysMs: number[] = [];
		let iteratorCalls = 0;
		Object.defineProperty(retryDelaysMs, Symbol.iterator, {
			value() {
				iteratorCalls += 1;
				throw new Error("The caller iterator must not run.");
			},
		});

		expect(() =>
			createRpcReconnectionConnector({
				adapterFactory: createSuccessfulConnectorAdapter,
				policy: { retryDelaysMs },
			}),
		).not.toThrow();
		expect(iteratorCalls).toBe(0);
	});
});
