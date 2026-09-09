/**
 * @overview Verifies owner policy boundaries.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRpcAcceptor,
	createRpcConnector,
	type RpcConnectorRuntimePolicyOptions,
} from "../../src/index";
import {
	captureThrownError,
	createProtocolHarness,
	expectSchemaFailureTypeError,
} from "./test.utils";

describe("cold Topology Owner factories", () => {
	it("RPC-API-001 RPC-POLICY-003 accepts the platform timer boundary and rejects every timing-field overflow", () => {
		const maximumTimerDelayMs = 2_147_483_647;
		const maximumProbeIntervalMs = Math.floor(maximumTimerDelayMs / 3);
		const validHarness = createProtocolHarness();
		expect(() =>
			createRpcConnector({
				protocolFactory: validHarness.connectorFactory,
				runtimePolicy: {
					ackDelayMs: maximumProbeIntervalMs,
					activityProbeIntervalMs: maximumProbeIntervalMs,
					silenceTimeoutMs: maximumTimerDelayMs,
					sendProgressTimeoutMs: maximumTimerDelayMs,
					bindingAttemptTimeoutMs: maximumTimerDelayMs,
					recoveryGraceMs: maximumTimerDelayMs,
					shutdownDeadlineMs: maximumTimerDelayMs,
				},
			}),
		).not.toThrow();
		expect(validHarness.connectorHosts).toHaveLength(1);

		const overflow = maximumTimerDelayMs + 1;
		const cases: readonly {
			readonly key: keyof RpcConnectorRuntimePolicyOptions;
			readonly runtimePolicy: RpcConnectorRuntimePolicyOptions;
		}[] = [
			{
				key: "ackDelayMs",
				runtimePolicy: {
					ackDelayMs: overflow,
					activityProbeIntervalMs: overflow,
					silenceTimeoutMs: 3 * overflow,
				},
			},
			{
				key: "activityProbeIntervalMs",
				runtimePolicy: {
					activityProbeIntervalMs: overflow,
					silenceTimeoutMs: 3 * overflow,
				},
			},
			{
				key: "silenceTimeoutMs",
				runtimePolicy: { silenceTimeoutMs: overflow },
			},
			{
				key: "sendProgressTimeoutMs",
				runtimePolicy: { sendProgressTimeoutMs: overflow },
			},
			{
				key: "bindingAttemptTimeoutMs",
				runtimePolicy: {
					bindingAttemptTimeoutMs: overflow,
					recoveryGraceMs: overflow,
				},
			},
			{ key: "recoveryGraceMs", runtimePolicy: { recoveryGraceMs: overflow } },
			{
				key: "shutdownDeadlineMs",
				runtimePolicy: { shutdownDeadlineMs: overflow },
			},
		];

		for (const testCase of cases) {
			const harness = createProtocolHarness();
			expect(
				() =>
					createRpcConnector({
						protocolFactory: harness.connectorFactory,
						runtimePolicy: testCase.runtimePolicy,
					}),
				testCase.key,
			).toThrow(testCase.key);
			expect(harness.connectorHosts, testCase.key).toHaveLength(0);
		}
	});

	it("RPC-API-001 RPC-POLICY-003 rejects closed-schema and cross-field violations before Protocol construction", () => {
		const cases: readonly unknown[] = [
			{ unknown: true },
			{ ["__proto__"]: true },
			{ runtimePolicy: { unknown: 1 } },
			{ runtimePolicy: { ["__proto__"]: 1 } },
			{ runtimePolicy: { maxSessions: 2 } },
			{
				runtimePolicy: {
					activityProbeIntervalMs: 100,
					silenceTimeoutMs: 299,
				},
			},
			{
				runtimePolicy: {
					ackDelayMs: 101,
					activityProbeIntervalMs: 100,
					silenceTimeoutMs: 300,
				},
			},
			{
				runtimePolicy: {
					bindingAttemptTimeoutMs: 101,
					recoveryGraceMs: 100,
				},
			},
			{ runtimePolicy: { maxRetainedBytesPerSession: 4 * 1024 * 1024 - 1 } },
			{
				runtimePolicy: {
					maxPendingInvocationsPerSession: Number.MAX_SAFE_INTEGER,
				},
			},
		];

		for (const options of cases) {
			const harness = createProtocolHarness();
			expectSchemaFailureTypeError(
				captureThrownError(() =>
					createRpcConnector({
						protocolFactory: harness.connectorFactory,
						...(options as object),
					} as never),
				),
			);
			expect(harness.connectorHosts).toHaveLength(0);
		}

		const acceptorHarness = createProtocolHarness();
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcAcceptor({
					protocolFactory: acceptorHarness.acceptorFactory,
					["__proto__"]: true,
				} as never),
			),
		);
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcAcceptor({
					protocolFactory: acceptorHarness.acceptorFactory,
					runtimePolicy: { ["__proto__"]: true },
				} as never),
			),
		);
		expect(acceptorHarness.acceptorHosts).toHaveLength(0);
	});

	it("RPC-POLICY-003 accepts equality boundaries and enforces aggregate reserve", () => {
		const validHarness = createProtocolHarness();
		expect(() =>
			createRpcAcceptor({
				protocolFactory: validHarness.acceptorFactory,
				runtimePolicy: {
					maxSessions: 64,
					maxRetainedBytesPerSession: 32 * 1024 * 1024,
					maxRetainedBytesTotal: 66_584_576,
					maxHandlersPerSession: 16,
					maxHandlersTotal: 16,
					ackDelayMs: 100,
					activityProbeIntervalMs: 100,
					silenceTimeoutMs: 300,
					bindingAttemptTimeoutMs: 100,
					recoveryGraceMs: 100,
				},
			}),
		).not.toThrow();

		const invalidHarness = createProtocolHarness();
		expectSchemaFailureTypeError(
			captureThrownError(() =>
				createRpcAcceptor({
					protocolFactory: invalidHarness.acceptorFactory,
					runtimePolicy: { maxRetainedBytesTotal: 66_584_575 },
				}),
			),
		);
		expect(invalidHarness.acceptorHosts).toHaveLength(0);
	});

	it("RPC-RESOURCE-004 RPC-POLICY-003 safely derives the exact 4 MiB shared-handshake budget", () => {
		const maximumSafeHandshakeCount = 2_147_483_647;
		const validHarness = createProtocolHarness();
		createRpcAcceptor({
			protocolFactory: validHarness.acceptorFactory,
			runtimePolicy: {
				maxSessions: 1,
				maxHandshakes: maximumSafeHandshakeCount,
				maxRetainedBytesPerSession: 4 * 1024 * 1024,
				maxRetainedBytesTotal: 4 * 1024 * 1024,
				maxHandlersPerSession: 1,
				maxHandlersTotal: 1,
			},
		});

		expect(validHarness.acceptorHosts[0]?.policy.maxHandshakes).toBe(
			maximumSafeHandshakeCount,
		);

		const invalidHarness = createProtocolHarness();
		expect(() =>
			createRpcAcceptor({
				protocolFactory: invalidHarness.acceptorFactory,
				runtimePolicy: {
					maxSessions: 1,
					maxHandshakes: maximumSafeHandshakeCount + 1,
					maxRetainedBytesPerSession: 4 * 1024 * 1024,
					maxRetainedBytesTotal: 4 * 1024 * 1024,
					maxHandlersPerSession: 1,
					maxHandlersTotal: 1,
				},
			}),
		).toThrow(TypeError);
		expect(invalidHarness.acceptorHosts).toHaveLength(0);
	});
});
