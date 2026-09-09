/**
 * @overview Verifies owner policy.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcAcceptor,
	createRpcConnector,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import { createProtocolHarness } from "./test.utils";

describe("cold Topology Owner factories", () => {
	it("RPC-POLICY-001 passes exact frozen role defaults to the Protocol", () => {
		const connectorHarness = createProtocolHarness();
		createRpcConnector({
			protocolFactory: connectorHarness.connectorFactory,
		});
		const acceptorHarness = createProtocolHarness();
		createRpcAcceptor({ protocolFactory: acceptorHarness.acceptorFactory });

		expect(connectorHarness.connectorHosts[0]?.policy).toEqual({
			maxSessions: 1,
			maxHandshakes: 1,
			maxPendingInvocationsPerSession: 256,
			maxRetainedBytesPerSession: 33_554_432,
			maxRetainedBytesTotal: 33_554_432,
			maxHandlersPerSession: 16,
			maxHandlersTotal: 16,
			ackDelayMs: 50,
			activityProbeIntervalMs: 30_000,
			silenceTimeoutMs: 120_000,
			sendProgressTimeoutMs: 30_000,
			bindingAttemptTimeoutMs: 30_000,
			recoveryGraceMs: 300_000,
			shutdownDeadlineMs: 5_000,
		});
		expect(acceptorHarness.acceptorHosts[0]?.policy).toEqual({
			...connectorHarness.connectorHosts[0]?.policy,
			maxSessions: 64,
			maxHandshakes: 16,
			maxRetainedBytesTotal: 67_108_864,
			maxHandlersTotal: 64,
		});
		expect(Object.isFrozen(connectorHarness.connectorHosts[0]?.policy)).toBe(
			true,
		);
		expect(Object.isFrozen(acceptorHarness.acceptorHosts[0]?.policy)).toBe(
			true,
		);
	});

	it("RPC-API-001 RPC-POLICY-001 parses ordinary Owner configuration objects", () => {
		const metadata = Symbol("metadata");
		const reads: string[] = [];
		const connectorHarness = createProtocolHarness();
		const connectorPolicy = new (class {
			readonly [metadata] = true;

			get maxHandlersPerSession(): number {
				reads.push("connector.policy");
				return 2;
			}
		})();
		const connectorOptions = new (class {
			readonly [metadata] = true;

			get protocolFactory(): RpcProtocolConnectorFactory {
				reads.push("connector.protocolFactory");
				return connectorHarness.connectorFactory;
			}

			get runtimePolicy(): typeof connectorPolicy {
				reads.push("connector.runtimePolicy");
				return connectorPolicy;
			}
		})();
		const acceptorHarness = createProtocolHarness();
		const acceptorPolicy = new (class {
			readonly [metadata] = true;

			get maxSessions(): number {
				reads.push("acceptor.policy");
				return 2;
			}
		})();
		const acceptorOptions = new (class {
			readonly [metadata] = true;

			get protocolFactory(): RpcProtocolAcceptorFactory {
				reads.push("acceptor.protocolFactory");
				return acceptorHarness.acceptorFactory;
			}

			get runtimePolicy(): typeof acceptorPolicy {
				reads.push("acceptor.runtimePolicy");
				return acceptorPolicy;
			}
		})();

		createRpcConnector(connectorOptions);
		createRpcAcceptor(acceptorOptions);

		expect(reads).toEqual(
			expect.arrayContaining([
				"connector.protocolFactory",
				"connector.runtimePolicy",
				"connector.policy",
				"acceptor.protocolFactory",
				"acceptor.runtimePolicy",
				"acceptor.policy",
			]),
		);
		expect(connectorHarness.connectorHosts[0]?.policy).toMatchObject({
			maxHandlersPerSession: 2,
			maxHandlersTotal: 2,
		});
		expect(acceptorHarness.acceptorHosts[0]?.policy.maxSessions).toBe(2);
	});

	it("RPC-API-001 RPC-POLICY-001 defaults explicit undefined policy options", () => {
		const connectorHarness = createProtocolHarness();
		const acceptorHarness = createProtocolHarness();

		createRpcConnector({
			protocolFactory: connectorHarness.connectorFactory,
			runtimePolicy: { maxHandlersPerSession: undefined } as never,
		});
		createRpcAcceptor({
			protocolFactory: acceptorHarness.acceptorFactory,
			runtimePolicy: { maxSessions: undefined } as never,
		});

		expect(
			connectorHarness.connectorHosts[0]?.policy.maxHandlersPerSession,
		).toBe(16);
		expect(acceptorHarness.acceptorHosts[0]?.policy.maxSessions).toBe(64);
	});

	it("RPC-SPI-003 RPC-RESOURCE-003 exposes an atomic idempotent Owner retained-byte port", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocolFactory: harness.connectorFactory });
		createRpcAcceptor({ protocolFactory: harness.acceptorFactory });
		expect(harness.connectorHosts).toHaveLength(1);
		expect(harness.acceptorHosts).toHaveLength(1);
		for (const host of [...harness.connectorHosts, ...harness.acceptorHosts]) {
			const reservation = host.reserveRetainedBytes(
				host.policy.maxRetainedBytesTotal,
			);
			expect(Object.isFrozen(reservation)).toBe(true);
			expect(host.reserveRetainedBytes(1)).toBeUndefined();

			reservation?.release();
			reservation?.release();
			const replacement = host.reserveRetainedBytes(
				host.policy.maxRetainedBytesTotal,
			);
			expect(replacement).toBeDefined();
			replacement?.release();
		}
	});

	it("RPC-API-001 RPC-POLICY-001 snapshots overrides and derives Connector totals", () => {
		const harness = createProtocolHarness();
		const runtimePolicy = {
			maxPendingInvocationsPerSession: 8,
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
			maxHandlersPerSession: 2,
			ackDelayMs: 25,
			activityProbeIntervalMs: 100,
			silenceTimeoutMs: 300,
			sendProgressTimeoutMs: 100,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 100,
			shutdownDeadlineMs: 100,
		};

		createRpcConnector({
			protocolFactory: harness.connectorFactory,
			runtimePolicy,
		});
		runtimePolicy.maxRetainedBytesPerSession = 8 * 1024 * 1024;
		runtimePolicy.maxHandlersPerSession = 4;

		expect(harness.connectorHosts[0]?.policy).toMatchObject({
			maxSessions: 1,
			maxHandshakes: 1,
			maxPendingInvocationsPerSession: 8,
			maxRetainedBytesPerSession: 4 * 1024 * 1024,
			maxRetainedBytesTotal: 4 * 1024 * 1024,
			maxHandlersPerSession: 2,
			maxHandlersTotal: 2,
		});
	});

	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
		2 ** 53,
		"1",
	])("RPC-API-001 RPC-POLICY-003 rejects invalid positive-safe-integer value %s", (value) => {
		const harness = createProtocolHarness();

		expect(() =>
			createRpcConnector({
				protocolFactory: harness.connectorFactory,
				runtimePolicy: {
					maxPendingInvocationsPerSession: value,
				} as never,
			}),
		).toThrow(TypeError);
		expect(harness.connectorHosts).toHaveLength(0);
	});
});
