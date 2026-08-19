/**
 * @overview Remote RPC specification compliance tests.
 *
 * Each test names the normative requirement that it exercises.
 *
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { CodedException, createServiceIdentifier } from "@husky-di/core";
import { Observable, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import packageManifest from "../package.json";
import {
	type RpcConformanceCaseResult,
	runRpcConnectorAdapterConformance,
} from "../src/conformance";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcConnector,
	type IRpcProtocol,
	type RpcConnectorRuntimePolicyOptions,
	type RpcEvent,
	RpcException,
} from "../src/index";
import type {
	IRpcConnection,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../src/protocol";
import { createMemoryConnectorFixture } from "./conformance/test.utils";

interface CalculatorService {
	add(left: number, right: number): number;
	cancel(value: string, signal: AbortSignal): Promise<string>;
}

interface CaseSensitiveService {
	Then(): void;
}

interface DeferredService {
	run(value: number): Promise<number>;
}

const ICalculatorService =
	createServiceIdentifier<CalculatorService>("ICalculatorService");
const ICaseSensitiveService = createServiceIdentifier<CaseSensitiveService>(
	"ICaseSensitiveService",
);
const IDeferredService =
	createServiceIdentifier<DeferredService>("IDeferredService");

describe("Adapter conformance traceability", () => {
	it("RPC-CONFORMANCE-003 emits canonical requirement-prefixed Adapter case IDs", async () => {
		const reports: RpcConformanceCaseResult[] = [];
		await runRpcConnectorAdapterConformance(createMemoryConnectorFixture(), {
			report: (result) => reports.push(result),
		});

		expect(reports).toHaveLength(10);
		expect(
			reports.every((result) => result.caseId.startsWith("RPC-TRANSPORT-")),
		).toBe(true);
	});
});

function createProtocolHarness(): {
	readonly protocol: IRpcProtocol;
	readonly connectorHosts: IRpcProtocolConnectorHost[];
	readonly acceptorHosts: IRpcProtocolAcceptorHost[];
	readonly calls: {
		connectorBind: number;
		acceptorAccept: number;
		shutdown: number;
		close: number;
		cleanup: number;
	};
} {
	const connectorHosts: IRpcProtocolConnectorHost[] = [];
	const acceptorHosts: IRpcProtocolAcceptorHost[] = [];
	const calls = {
		connectorBind: 0,
		acceptorAccept: 0,
		shutdown: 0,
		close: 0,
		cleanup: 0,
	};

	const protocol = Object.freeze<IRpcProtocol>({
		createConnector(host) {
			connectorHosts.push(host);
			return {
				async bind() {
					calls.connectorBind += 1;
				},
				async shutdown() {
					calls.shutdown += 1;
				},
				close() {
					calls.close += 1;
				},
				async cleanup() {
					calls.cleanup += 1;
				},
			};
		},
		createAcceptor(host) {
			acceptorHosts.push(host);
			return {
				async accept() {
					calls.acceptorAccept += 1;
				},
				async shutdown() {
					calls.shutdown += 1;
				},
				close() {
					calls.close += 1;
				},
				async cleanup() {
					calls.cleanup += 1;
				},
			};
		},
	});

	return { protocol, connectorHosts, acceptorHosts, calls };
}

async function connectProtocolSession(
	session: IRpcProtocolSession,
	runtimePolicy?: RpcConnectorRuntimePolicyOptions,
): Promise<{
	readonly connector: IRpcConnector;
	readonly host: IRpcProtocolConnectorHost;
	readonly sessionHost: IRpcProtocolSessionHost;
	readonly events: RpcEvent[];
}> {
	const connectionSource = new Subject<IRpcConnection>();
	const messageSource = new Subject<Uint8Array>();
	let connectorHost: IRpcProtocolConnectorHost | undefined;
	let sessionHost: IRpcProtocolSessionHost | undefined;
	const protocol: IRpcProtocol = {
		createConnector(host) {
			connectorHost = host;
			return {
				bind(connection) {
					connection.message$.subscribe();
					return Promise.resolve().then(() => {
						sessionHost = host.attachSession(session);
						if (sessionHost === undefined) {
							throw new Error("The test Session was not attached.");
						}
					});
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		},
		createAcceptor() {
			return {
				async accept() {},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		},
	};
	const connector = createRpcConnector({ protocol, runtimePolicy });
	const events: RpcEvent[] = [];
	connector.event$.subscribe((event) => events.push(event));
	await connector.connect({
		connection$: connectionSource.asObservable(),
		async connect() {
			connectionSource.next({
				message$: messageSource.asObservable(),
				async send() {},
				async close() {},
			});
			connectionSource.complete();
		},
	});
	if (connectorHost === undefined) {
		throw new Error("Expected a Connector Protocol host.");
	}
	if (sessionHost === undefined) {
		throw new Error("Expected a Connector Protocol Session host.");
	}
	return { connector, host: connectorHost, sessionHost, events };
}

describe("Remote Service Descriptor", () => {
	it("RPC-DESC-001 creates an opaque Descriptor from local and wire identities", () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: {
				add: true,
				cancel: { cancelable: true },
			},
		});

		expect(descriptor).toBeTypeOf("object");
		expect("serviceIdentifier" in descriptor).toBe(false);
		expect("wireName" in descriptor).toBe(false);
		expect("methods" in descriptor).toBe(false);
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
	])("RPC-DESC-002 RPC-DESC-003 rejects %s", (_label, options) => {
		expect(() =>
			createRemoteServiceDescriptor(
				ICalculatorService,
				options as unknown as {
					readonly wireName: string;
					readonly methods: { readonly add: true };
				},
			),
		).toThrow(TypeError);
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

describe("cold Topology Owner factories", () => {
	it("RPC-PKG-005 exposes portable package metadata", () => {
		expect(packageManifest).toMatchObject({
			type: "module",
			sideEffects: false,
			engines: { node: ">=23.6" },
			publishConfig: { access: "public" },
		});
	});

	it("RPC-API-001 RPC-SPI-001 constructs only the selected custom Protocol role", () => {
		const connectorHarness = createProtocolHarness();
		createRpcConnector({ protocol: connectorHarness.protocol });

		expect(connectorHarness.connectorHosts).toHaveLength(1);
		expect(connectorHarness.acceptorHosts).toHaveLength(0);
		expect(connectorHarness.calls).toEqual({
			connectorBind: 0,
			acceptorAccept: 0,
			shutdown: 0,
			close: 0,
			cleanup: 0,
		});

		const acceptorHarness = createProtocolHarness();
		createRpcAcceptor({ protocol: acceptorHarness.protocol });

		expect(acceptorHarness.connectorHosts).toHaveLength(0);
		expect(acceptorHarness.acceptorHosts).toHaveLength(1);
		expect(acceptorHarness.calls).toEqual({
			connectorBind: 0,
			acceptorAccept: 0,
			shutdown: 0,
			close: 0,
			cleanup: 0,
		});
	});

	it("RPC-API-002 RPC-API-003 RPC-STATE-001 expose frozen cold Connector snapshots", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const ownerStates: unknown[] = [];
		const peerStates: unknown[] = [];

		connector.state$.subscribe((state) => ownerStates.push(state));
		connector.peer.state$.subscribe((state) => peerStates.push(state));

		expect(connector.state).toEqual({ status: "active" });
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(ownerStates).toEqual([connector.state]);
		expect(peerStates).toEqual([connector.peer.state]);
		expect(Object.isFrozen(connector.state)).toBe(true);
		expect(Object.isFrozen(connector.peer.state)).toBe(true);
	});

	it("RPC-API-003 exposes frozen cold Acceptor state without replayed events", () => {
		const { protocol } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol });
		const ownerStates: unknown[] = [];
		const memberships: unknown[] = [];
		const events: unknown[] = [];

		acceptor.state$.subscribe((state) => ownerStates.push(state));
		acceptor.peers$.subscribe((peers) => memberships.push(peers));
		acceptor.event$.subscribe((event) => events.push(event));

		const state = acceptor.state;
		expect(state).toEqual({
			status: "active",
			listener: { status: "idle" },
		});
		if (state.status !== "active") {
			throw new Error("A cold Acceptor must start active.");
		}
		expect(acceptor.peers).toEqual([]);
		expect(ownerStates).toEqual([state]);
		expect(memberships).toEqual([acceptor.peers]);
		expect(events).toEqual([]);
		expect(Object.isFrozen(state)).toBe(true);
		expect(Object.isFrozen(state.listener)).toBe(true);
		expect(Object.isFrozen(acceptor.peers)).toBe(true);
	});

	it("RPC-POLICY-001 passes exact frozen role defaults to the Protocol", () => {
		const connectorHarness = createProtocolHarness();
		createRpcConnector({ protocol: connectorHarness.protocol });
		const acceptorHarness = createProtocolHarness();
		createRpcAcceptor({ protocol: acceptorHarness.protocol });

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

		createRpcConnector({ protocol: harness.protocol, runtimePolicy });
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
				protocol: harness.protocol,
				runtimePolicy: {
					maxPendingInvocationsPerSession: value,
				} as never,
			}),
		).toThrow(TypeError);
		expect(harness.connectorHosts).toHaveLength(0);
	});

	it("RPC-API-001 RPC-POLICY-003 rejects closed-schema and cross-field violations before Protocol construction", () => {
		const cases: readonly unknown[] = [
			{ unknown: true },
			{ runtimePolicy: { unknown: 1 } },
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
			expect(() =>
				createRpcConnector(
					Object.assign({ protocol: harness.protocol }, options) as never,
				),
			).toThrow(TypeError);
			expect(harness.connectorHosts).toHaveLength(0);
		}
	});

	it("RPC-POLICY-003 accepts equality boundaries and enforces aggregate reserve", () => {
		const validHarness = createProtocolHarness();
		expect(() =>
			createRpcAcceptor({
				protocol: validHarness.protocol,
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
		expect(() =>
			createRpcAcceptor({
				protocol: invalidHarness.protocol,
				runtimePolicy: { maxRetainedBytesTotal: 66_584_575 },
			}),
		).toThrow(TypeError);
		expect(invalidHarness.acceptorHosts).toHaveLength(0);
	});

	it("RPC-RESOURCE-004 RPC-POLICY-003 safely derives the exact 4 MiB shared-handshake budget", () => {
		const maximumSafeHandshakeCount = 2_147_483_647;
		const validHarness = createProtocolHarness();
		createRpcAcceptor({
			protocol: validHarness.protocol,
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
				protocol: invalidHarness.protocol,
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

	it("RPC-API-001 wraps custom Protocol construction failures", () => {
		const cause = new Error("construction failed");
		const throwingProtocol: IRpcProtocol = {
			createConnector() {
				throw cause;
			},
			createAcceptor() {
				throw cause;
			},
		};

		try {
			createRpcConnector({ protocol: throwingProtocol });
			throw new Error("Expected Protocol construction to fail.");
		} catch (error) {
			expect(error).toMatchObject({ code: "protocol", cause });
		}

		expect(() => createRpcAcceptor({ protocol: {} as IRpcProtocol })).toThrow(
			expect.objectContaining({ code: "protocol" }),
		);
	});
});

describe("Application Value normalization", () => {
	it("RPC-VALUE-001 RPC-VALUE-002 RPC-VALUE-005 creates a detached frozen snapshot with deterministic weight", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocol: harness.protocol });
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
		createRpcConnector({ protocol: harness.protocol });
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
		createRpcConnector({ protocol: harness.protocol });
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
		createRpcConnector({ protocol: harness.protocol });
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
		createRpcConnector({ protocol: harness.protocol });
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
		createRpcConnector({ protocol: harness.protocol });
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

describe("exposure registries and remote facades", () => {
	it("RPC-DESC-004 RPC-DESC-005 installs exposures atomically and cleans them up idempotently", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: {
				add: true,
				cancel: { cancelable: true },
			},
		});
		const invalidImplementation = {
			add(left: number, right: number) {
				return left + right;
			},
			cancel: "not a function",
		};
		const implementation: CalculatorService = {
			add(left, right) {
				return left + right;
			},
			async cancel(value) {
				return value;
			},
		};

		expect(() =>
			connector.peer.expose(descriptor, invalidImplementation as never),
		).toThrow(TypeError);
		const cleanup = connector.peer.expose(descriptor, implementation);
		expect(() => connector.peer.expose(descriptor, implementation)).toThrow(
			TypeError,
		);
		expect(cleanup()).toBeUndefined();
		expect(cleanup()).toBeUndefined();
		expect(() =>
			connector.peer.expose(descriptor, implementation),
		).not.toThrow();
	});

	it("RPC-CALL-001 creates frozen non-thenable single and group facades", async () => {
		const connectorHarness = createProtocolHarness();
		const connector = createRpcConnector({
			protocol: connectorHarness.protocol,
		});
		const acceptorHarness = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol: acceptorHarness.protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		const remote = connector.peer.resolve(descriptor);
		const group = acceptor.resolveAll(descriptor);
		for (const facade of [remote, group]) {
			expect(Object.getPrototypeOf(facade)).toBeNull();
			expect(Object.isFrozen(facade)).toBe(true);
			expect(Object.keys(facade)).toEqual(["add"]);
			expect(facade.then).toBeUndefined();
			expect(await Promise.resolve(facade)).toBe(facade);
		}

		const { add } = remote;
		await expect(add(1, 2)).rejects.toMatchObject({ code: "unavailable" });
	});

	it("RPC-DESC-004 RPC-DESC-005 applies the same duplicate and cleanup rules to Acceptor owner exposure", () => {
		const { protocol } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const implementation = {
			add: (left: number, right: number) => left + right,
		};

		const cleanup = acceptor.expose(descriptor, implementation);
		expect(() => acceptor.expose(descriptor, implementation)).toThrow(
			TypeError,
		);
		cleanup();
		cleanup();
		expect(() => acceptor.expose(descriptor, implementation)).not.toThrow();
	});

	it("RPC-CALL-002 validates the dedicated cancellation slot before peer availability", async () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { cancel: { cancelable: true } },
		});
		const remote = connector.peer.resolve(descriptor);
		const escapedCancel = remote.cancel as unknown as (
			...args: unknown[]
		) => Promise<unknown>;
		let businessGetterCalls = 0;
		const businessValue = Object.defineProperty({}, "value", {
			enumerable: true,
			get() {
				businessGetterCalls += 1;
				return "not inspected";
			},
		});

		await expect(escapedCancel()).rejects.toBeInstanceOf(TypeError);
		await expect(escapedCancel(businessValue)).rejects.toBeInstanceOf(
			TypeError,
		);
		await expect(
			escapedCancel(businessValue, {
				aborted: false,
				addEventListener() {},
			}),
		).rejects.toBeInstanceOf(TypeError);

		const controller = new AbortController();
		controller.abort();
		await expect(
			escapedCancel(businessValue, controller.signal),
		).rejects.toMatchObject({ code: "canceled" });
		await expect(escapedCancel(businessValue, undefined)).rejects.toMatchObject(
			{ code: "unavailable" },
		);
		expect(businessGetterCalls).toBe(0);
	});
});

describe("Adapter startup and Protocol handoff", () => {
	it("RPC-START-002 RPC-TRANSPORT-008 RPC-SPI-008 subscribes and binds inside the Connector handoff barrier", async () => {
		const connectionSubject = new Subject<IRpcConnection>();
		const messageSubject = new Subject<Uint8Array>();
		const receivedMessages: Uint8Array[] = [];
		let connectionSourceSubscribed = false;
		let insideHandoffNotification = false;
		let bindRanInsideNotification = false;
		let releaseBinding: (() => void) | undefined;
		let connectorHost: IRpcProtocolConnectorHost | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const connection: IRpcConnection = {
			message$: messageSubject.asObservable(),
			async send() {},
			async close() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				connectorHost = host;
				return {
					bind(boundConnection) {
						bindRanInsideNotification = insideHandoffNotification;
						boundConnection.message$.subscribe((message) =>
							receivedMessages.push(message),
						);
						return new Promise<void>((resolve) => {
							releaseBinding = () => {
								expect(host.attachSession(session)).toBeDefined();
								resolve();
							};
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const adapter = {
			connection$: new Observable<IRpcConnection>((subscriber) => {
				connectionSourceSubscribed = true;
				return connectionSubject.subscribe(subscriber);
			}),
			async connect() {
				expect(connectionSourceSubscribed).toBe(true);
				insideHandoffNotification = true;
				connectionSubject.next(connection);
				insideHandoffNotification = false;
				messageSubject.next(Uint8Array.of(7));
				connectionSubject.complete();
			},
		};

		const connector = createRpcConnector({ protocol });
		const startup = connector.connect(adapter);
		expect(connector.peer.state).toEqual({ status: "connecting" });
		expect(bindRanInsideNotification).toBe(true);
		expect(receivedMessages).toEqual([Uint8Array.of(7)]);
		expect(connectorHost).toBeDefined();

		let settled = false;
		void startup.then(() => {
			settled = true;
		});
		await Promise.resolve();
		expect(settled).toBe(false);
		releaseBinding?.();
		await startup;
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-START-002 RPC-START-004 rejects an unattached fresh binding, closes it, and restores unbound", async () => {
		const harness = createProtocolHarness();
		const connectionSubject = new Subject<IRpcConnection>();
		let closeCalls = 0;
		const connection: IRpcConnection = {
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {
				closeCalls += 1;
			},
		};
		const connector = createRpcConnector({ protocol: harness.protocol });

		await expect(
			connector.connect({
				connection$: connectionSubject.asObservable(),
				async connect() {
					connectionSubject.next(connection);
					connectionSubject.complete();
				},
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(closeCalls).toBe(1);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-TRANSPORT-008 rejects a Connector Adapter that completes without handoff", async () => {
		const harness = createProtocolHarness();
		const connectionSubject = new Subject<IRpcConnection>();
		const connector = createRpcConnector({ protocol: harness.protocol });
		const startup = connector.connect({
			connection$: connectionSubject.asObservable(),
			async connect() {
				connectionSubject.complete();
			},
		});

		const outcome = await Promise.race([
			startup.then(
				() => "fulfilled",
				(error: unknown) =>
					typeof error === "object" &&
					error !== null &&
					Reflect.get(error, "code") === "unavailable"
						? "unavailable"
						: "other-error",
			),
			new Promise<string>((resolve) => {
				setTimeout(() => resolve("timeout"), 20);
			}),
		]);
		expect(outcome).toBe("unavailable");
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-003 RPC-TRANSPORT-009 RPC-SPI-008 separates Acceptor readiness from Session admission", async () => {
		const connectionSubject = new Subject<IRpcConnection>();
		const messageSubject = new Subject<Uint8Array>();
		const receivedMessages: Uint8Array[] = [];
		let connectionSourceSubscribed = false;
		let insideHandoffNotification = false;
		let acceptRanInsideNotification = false;
		let releaseReady: (() => void) | undefined;
		let releaseAcceptance: (() => void) | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const connection: IRpcConnection = {
			message$: messageSubject.asObservable(),
			async send() {},
			async close() {},
		};
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor(host) {
				return {
					accept(boundConnection) {
						acceptRanInsideNotification = insideHandoffNotification;
						boundConnection.message$.subscribe((message) =>
							receivedMessages.push(message),
						);
						return new Promise<void>((resolve) => {
							releaseAcceptance = () => {
								expect(host.admitSession(session)).toBeDefined();
								resolve();
							};
						});
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const adapter = {
			connection$: new Observable<IRpcConnection>((subscriber) => {
				connectionSourceSubscribed = true;
				return connectionSubject.subscribe(subscriber);
			}),
			listen() {
				expect(connectionSourceSubscribed).toBe(true);
				insideHandoffNotification = true;
				connectionSubject.next(connection);
				insideHandoffNotification = false;
				messageSubject.next(Uint8Array.of(9));
				return new Promise<void>((resolve) => {
					releaseReady = resolve;
				});
			},
		};

		const acceptor = createRpcAcceptor({ protocol });
		const startup = acceptor.listen(adapter);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "starting" },
		});
		expect(acceptRanInsideNotification).toBe(true);
		expect(receivedMessages).toEqual([Uint8Array.of(9)]);
		expect(acceptor.peers).toEqual([]);

		releaseReady?.();
		await startup;
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});
		expect(acceptor.peers).toEqual([]);

		releaseAcceptance?.();
		await Promise.resolve();
		expect(acceptor.peers).toHaveLength(1);
		expect(acceptor.peers[0]?.state).toEqual({ status: "connected" });

		connectionSubject.complete();
		expect(acceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "normal",
				reason: "completed",
			},
		});
		expect(acceptor.peers).toHaveLength(1);
	});

	it("RPC-START-004 maps Acceptor pre-ready completion and source error without hanging", async () => {
		const completedHarness = createProtocolHarness();
		const completedSource = new Subject<IRpcConnection>();
		const completedAcceptor = createRpcAcceptor({
			protocol: completedHarness.protocol,
		});
		const completedStartup = completedAcceptor.listen({
			connection$: completedSource.asObservable(),
			listen() {
				completedSource.complete();
				return new Promise<void>(() => {});
			},
		});
		await expect(completedStartup).rejects.toMatchObject({
			code: "unavailable",
			cause: undefined,
		});
		expect(completedAcceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "normal",
				reason: "completed",
			},
		});

		const cause = new Error("listener failed");
		const failedHarness = createProtocolHarness();
		const failedSource = new Subject<IRpcConnection>();
		const failedAcceptor = createRpcAcceptor({
			protocol: failedHarness.protocol,
		});
		const failedStartup = failedAcceptor.listen({
			connection$: failedSource.asObservable(),
			listen() {
				failedSource.error(cause);
				return Promise.reject(cause);
			},
		});
		await expect(failedStartup).rejects.toMatchObject({
			code: "unavailable",
			cause,
		});
		expect(failedAcceptor.state).toEqual({
			status: "active",
			listener: { status: "stopped", outcome: "failed", error: cause },
		});
	});

	it("RPC-START-003 RPC-START-004 keeps a ready listener fulfilled and isolates accept failure", async () => {
		const connectionSource = new Subject<IRpcConnection>();
		const messageSource = new Subject<Uint8Array>();
		const sourceFailure = new Error("source lifetime failed");
		let closeCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {
						throw new Error("one connection failed");
					},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const startup = acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {},
		});
		await startup;
		connectionSource.next({
			message$: messageSource.asObservable(),
			async send() {},
			async close() {
				closeCalls += 1;
			},
		});
		await Promise.resolve();
		await Promise.resolve();
		expect(closeCalls).toBe(1);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});

		connectionSource.error(sourceFailure);
		expect(acceptor.state).toEqual({
			status: "active",
			listener: {
				status: "stopped",
				outcome: "failed",
				error: sourceFailure,
			},
		});
		await expect(startup).resolves.toBeUndefined();
	});
});

describe("custom Protocol outgoing invocations", () => {
	it("RPC-CALL-009 exposes a caller-constructible coded RpcException", () => {
		const cause = new Error("trusted local failure");
		const exception = new RpcException("unavailable", cause);

		expect(exception).toBeInstanceOf(CodedException);
		expect(exception).toMatchObject({
			name: "RpcException",
			code: "unavailable",
			detail: "RPC failed.",
			cause,
		});
	});

	it("RPC-BASE-001 RPC-CALL-007 does not retry an admitted identity after its evidence is lost", async () => {
		let sink: IRpcProtocolInvocationSink | undefined;
		let reserveCalls = 0;
		let startCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				reserveCalls += 1;
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {
								startCalls += 1;
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, events, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const remote = connector.peer.resolve(descriptor);
		const admitted = remote.add(1, 2);

		sink?.finish({ type: "failed", code: "outcome-unknown" });
		sessionHost.transition({
			type: "closed",
			reason: "continuity-failure",
		});

		const admittedError = await admitted.catch((error: unknown) => error);
		expect(admittedError).toBeInstanceOf(RpcException);
		expect(admittedError).toBeInstanceOf(CodedException);
		expect(admittedError).toMatchObject({
			code: "outcome-unknown",
			detail: "RPC failed.",
			cause: undefined,
		});
		expect(admittedError).not.toHaveProperty("details");
		expect(reserveCalls).toBe(1);
		expect(startCalls).toBe(1);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "call-finished",
				outcome: "rejected",
				code: "outcome-unknown",
			}),
		);

		await expect(remote.add(3, 4)).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(reserveCalls).toBe(1);
		await connector.close();
	});

	it("RPC-SPI-011 closes the Acceptor runtime before projecting an owner fault", async () => {
		let protocolHost: IRpcProtocolAcceptorHost | undefined;
		let acceptor: ReturnType<typeof createRpcAcceptor> | undefined;
		const operations: string[] = [];
		const protocol: IRpcProtocol = {
			createConnector() {
				throw new Error("Connector runtime is not used by this test.");
			},
			createAcceptor(host) {
				protocolHost = host;
				return {
					async accept() {},
					async shutdown() {},
					close() {
						operations.push("runtime-close");
						expect(acceptor?.state.status).toBe("active");
					},
					async cleanup() {
						operations.push("runtime-cleanup");
					},
				};
			},
		};
		acceptor = createRpcAcceptor({ protocol });
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));
		const first = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {
				operations.push("first-force");
			},
		});
		const second = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {
				operations.push("second-force");
			},
		});
		if (
			protocolHost === undefined ||
			first === undefined ||
			second === undefined
		) {
			throw new Error("Expected two admitted Acceptor Sessions.");
		}
		const [firstPeer, secondPeer] = acceptor.peers;
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two public Acceptor peers.");
		}
		const fault = new Error("shared Protocol invariant failed");

		protocolHost.fault("protocol-fault", fault);

		expect(operations[0]).toBe("runtime-close");
		expect(acceptor.state).toEqual({ status: "closing" });
		expect(acceptor.peers).toEqual([]);
		expect(firstPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(secondPeer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-opened",
			"peer-closed",
			"peer-closed",
			"owner-closing",
		]);

		await expect(acceptor.close()).resolves.toBeUndefined();
		expect(acceptor.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
			error: { code: "protocol", cause: fault },
		});
		expect(operations).toContain("runtime-cleanup");
	});

	it("RPC-SPI-004 RPC-SPI-005 RPC-CALL-005 RPC-CALL-006 drive reservation, sink, observations, and result", async () => {
		let sink: IRpcProtocolInvocationSink | undefined;
		let startCalls = 0;
		let releaseCalls = 0;
		let request:
			| {
					readonly service: string;
					readonly method: string;
					readonly args: { readonly value: readonly unknown[] };
			  }
			| undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation(nextRequest) {
				request = nextRequest;
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {
								startCalls += 1;
							},
							cancel() {},
						};
					},
					release() {
						releaseCalls += 1;
					},
				};
			},
			forceClose() {},
		};
		const { connector, host, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const result = connector.peer.resolve(descriptor).add(1, 2);

		expect(request?.service).toBe("example.calculator.v1");
		expect(request?.method).toBe("add");
		expect(request?.args.value).toEqual([1, 2]);
		expect(startCalls).toBe(1);
		expect(releaseCalls).toBe(0);
		const callEvents = events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(callEvents).toMatchObject([
			{
				type: "call-started",
				direction: "outgoing",
				service: "example.calculator.v1",
				method: "add",
			},
		]);

		sink?.finish({
			type: "returned",
			value: host.normalizeApplicationValue(3),
		});
		await expect(result).resolves.toBe(3);
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toMatchObject([
			{ type: "call-started" },
			{
				type: "call-finished",
				direction: "outgoing",
				service: "example.calculator.v1",
				method: "add",
				outcome: "fulfilled",
			},
		]);
	});

	it("RPC-CALL-003 RPC-CALL-006 uses trusted AbortSignal intrinsics and preserves canceled settlement", async () => {
		let sink: IRpcProtocolInvocationSink | undefined;
		let cancelCalls = 0;
		let startCalls = 0;
		let shadowMethodCalls = 0;
		let requestArguments: readonly unknown[] | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation(request) {
				requestArguments = request.args.value;
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {
								startCalls += 1;
							},
							cancel() {
								cancelCalls += 1;
								sink?.finish({ type: "failed", code: "canceled" });
							},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { cancel: { cancelable: true } },
		});
		const controller = new AbortController();
		Object.defineProperties(controller.signal, {
			addEventListener: {
				value: () => {
					shadowMethodCalls += 1;
				},
			},
			removeEventListener: {
				value: () => {
					shadowMethodCalls += 1;
				},
			},
		});

		const result = connector.peer
			.resolve(descriptor)
			.cancel("value", controller.signal);
		expect(requestArguments).toEqual(["value"]);
		expect(startCalls).toBe(1);
		controller.abort();
		await expect(result).rejects.toMatchObject({ code: "canceled" });
		expect(cancelCalls).toBe(1);
		expect(shadowMethodCalls).toBe(0);
		expect(events[events.length - 1]).toMatchObject({
			type: "call-finished",
			outcome: "rejected",
			code: "canceled",
		});
	});

	it("RPC-SPI-004 maps reservation capacity failure to unavailable without call events", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		await expect(
			connector.peer.resolve(descriptor).add(1, 2),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
	});
});

describe("stable remote service groups", () => {
	it("RPC-GROUP-001 RPC-GROUP-002 RPC-GROUP-003 reserves and commits every child before ordered start", async () => {
		const harness = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });
		const host = harness.acceptorHosts[0];
		if (host === undefined) {
			throw new Error("Expected an Acceptor Protocol host.");
		}
		const operations: string[] = [];
		const createSession = (
			name: string,
			outcome:
				| { readonly type: "returned"; readonly value: number }
				| { readonly type: "failed"; readonly code: "handler-failed" },
		): IRpcProtocolSession => ({
			reserveInvocation(request) {
				operations.push(`reserve-${name}`);
				expect(request.args.value).toEqual([1, 2]);
				return {
					commit(sink) {
						operations.push(`commit-${name}`);
						return {
							start() {
								operations.push(`start-${name}`);
								if (outcome.type === "returned") {
									sink.finish({
										type: "returned",
										value: host.normalizeApplicationValue(outcome.value),
									});
								} else {
									sink.finish(outcome);
								}
							},
							cancel() {},
						};
					},
					release() {
						operations.push(`release-${name}`);
					},
				};
			},
			forceClose() {},
		});
		expect(
			host.admitSession(createSession("first", { type: "returned", value: 3 })),
		).toBeDefined();
		expect(
			host.admitSession(
				createSession("second", {
					type: "failed",
					code: "handler-failed",
				}),
			),
		).toBeDefined();
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		const results = await acceptor.resolveAll(descriptor).add(1, 2);
		expect(operations).toEqual([
			"reserve-first",
			"reserve-second",
			"commit-first",
			"commit-second",
			"start-first",
			"start-second",
		]);
		expect(Object.isFrozen(results)).toBe(true);
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({
			peer: acceptor.peers[0],
			status: "fulfilled",
			value: 3,
		});
		expect(results[1]).toMatchObject({
			peer: acceptor.peers[1],
			status: "rejected",
			reason: { code: "handler-failed" },
		});
		if (results[1]?.status !== "rejected") {
			throw new Error("Expected the second group child to reject.");
		}
		expect(results[1].reason).toBeInstanceOf(RpcException);
	});

	it("RPC-GROUP-002 rolls back every reservation when one child lacks capacity", async () => {
		const harness = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });
		const host = harness.acceptorHosts[0];
		if (host === undefined) {
			throw new Error("Expected an Acceptor Protocol host.");
		}
		let releaseCalls = 0;
		let commitCalls = 0;
		host.admitSession({
			reserveInvocation() {
				return {
					commit() {
						commitCalls += 1;
						return { start() {}, cancel() {} };
					},
					release() {
						releaseCalls += 1;
					},
				};
			},
			forceClose() {},
		});
		host.admitSession({
			reserveInvocation: () => undefined,
			forceClose() {},
		});
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});

		await expect(
			acceptor.resolveAll(descriptor).add(1, 2),
		).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(releaseCalls).toBe(1);
		expect(commitCalls).toBe(0);
	});
});

describe("custom Protocol incoming calls", () => {
	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-005 rejects forged snapshots passed to semantic equality", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host } = await connectProtocolSession(session);
		const canonical = host.normalizeApplicationValue({ value: 1 });

		expect(
			host.applicationValuesEqual(canonical, {
				value: { value: 1 },
				weight: canonical.weight,
			} as never),
		).toBe(false);
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-005 rejects a forged outgoing Application snapshot", async () => {
		let sink: IRpcProtocolInvocationSink | undefined;
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				return {
					commit(nextSink) {
						sink = nextSink;
						return { start() {}, cancel() {} };
					},
					release() {},
				};
			},
			forceClose() {
				forceCalls += 1;
				sink?.finish({ type: "failed", code: "outcome-unknown" });
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const result = connector.peer.resolve(descriptor).add(20, 21);

		sink?.finish({
			type: "returned",
			value: { value: 41, weight: 2 } as never,
		});

		await expect(result).rejects.toMatchObject({ code: "outcome-unknown" });
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-006 rejects a mismatched unknown-call terminal", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const reserved = sessionHost.reserveIncomingCall({
			service: "unknown.service",
			method: "unknownMethod",
			args: host.normalizeApplicationArguments([]),
		});
		if (reserved?.kind !== "unknown") {
			throw new Error("Expected an unknown-call reservation.");
		}
		const call = reserved.reservation.commit();

		call.finish({ type: "failed", code: "unknown-method" });

		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-003 RPC-SPI-006 rejects an impossible handler terminal", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			methods: { run: true },
		});
		connector.peer.expose(descriptor, {
			run: () => new Promise<number>(() => {}),
		});
		const reserved = sessionHost.reserveIncomingCall({
			service: "example.deferred.v1",
			method: "run",
			args: host.normalizeApplicationArguments([1]),
		});
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a handler reservation.");
		}
		const call = reserved.reservation.commit();

		call.finish({ type: "failed", code: "unknown-service" });

		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		await connector.close();
	});

	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-006 rejects forged incoming arguments before lookup", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, sessionHost, events } =
			await connectProtocolSession(session);

		const reservation = sessionHost.reserveIncomingCall({
			service: "attacker.service",
			method: "attackerMethod",
			args: { value: [], weight: 2 } as never,
		});

		expect(reservation).toBeUndefined();
		expect(forceCalls).toBe(1);
		expect(connector.peer.state).toMatchObject({
			status: "closed",
			outcome: "failed",
			reason: "protocol-fault",
		});
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-SPI-006 RPC-SPI-007 RPC-EVENT-001 RPC-EVENT-002 RPC-EVENT-003 captures a known route, defers dispatch, and publishes a paired observation", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		let handlerCalls = 0;
		const implementation = {
			base: 10,
			add(this: { base: number }, left: number, right: number) {
				handlerCalls += 1;
				return this.base + left + right;
			},
		};
		connector.peer.expose(descriptor, implementation);

		const reserved = sessionHost.reserveIncomingCall({
			service: "example.calculator.v1",
			method: "add",
			args: host.normalizeApplicationArguments([2, 3]),
		});
		expect(reserved?.kind).toBe("handler");
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a known handler reservation.");
		}
		const call = reserved.reservation.commit();
		expect(handlerCalls).toBe(0);
		const handlerOutcome = await call.handlerOutcome;
		expect(handlerCalls).toBe(1);
		expect(handlerOutcome).toMatchObject({
			type: "returned",
			value: { value: 15 },
		});
		if (handlerOutcome.type !== "returned") {
			throw new Error("Expected a returned handler value.");
		}
		call.finish({ type: "returned", value: handlerOutcome.value });

		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toMatchObject([
			{
				type: "call-started",
				direction: "incoming",
				service: "example.calculator.v1",
				method: "add",
			},
			{
				type: "call-finished",
				direction: "incoming",
				service: "example.calculator.v1",
				method: "add",
				outcome: "fulfilled",
			},
		]);
	});

	it("RPC-SPI-006 RPC-SPI-007 RPC-EVENT-001 RPC-EVENT-002 RPC-EVENT-003 emits safe correlated unknown-service and unknown-method pairs", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		connector.peer.expose(descriptor, { add: (left, right) => left + right });
		const args = host.normalizeApplicationArguments([]);

		const unknownService = sessionHost.reserveIncomingCall({
			service: "attacker.supplied.service",
			method: "attackerMethod",
			args,
		});
		expect(unknownService).toMatchObject({
			kind: "unknown",
			code: "unknown-service",
		});
		if (unknownService?.kind !== "unknown") {
			throw new Error("Expected unknown-service reservation.");
		}
		unknownService.reservation
			.commit()
			.finish({ type: "failed", code: "unknown-service" });

		const unknownMethod = sessionHost.reserveIncomingCall({
			service: "example.calculator.v1",
			method: "attackerMethod",
			args,
		});
		expect(unknownMethod).toMatchObject({
			kind: "unknown",
			code: "unknown-method",
		});
		if (unknownMethod?.kind !== "unknown") {
			throw new Error("Expected unknown-method reservation.");
		}
		unknownMethod.reservation
			.commit()
			.finish({ type: "failed", code: "unknown-method" });

		const observations = events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(observations).toHaveLength(4);
		expect(observations[0]).toMatchObject({ direction: "incoming" });
		expect(observations[0]).not.toHaveProperty("service");
		expect(observations[0]).not.toHaveProperty("method");
		expect(observations[1]).toMatchObject({ code: "unknown-service" });
		expect(observations[2]).toMatchObject({
			direction: "incoming",
			service: "example.calculator.v1",
		});
		expect(observations[2]).not.toHaveProperty("method");
		expect(observations[3]).toMatchObject({ code: "unknown-method" });
		expect(connector.peer.state).toEqual({ status: "connected" });
		await connector.close();
	});

	it("RPC-CALL-008 holds the Session and Owner permits until real handler settlement", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } = await connectProtocolSession(
			session,
			{ maxHandlersPerSession: 1 },
		);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			methods: { run: true },
		});
		const handlerResolvers: ((value: number) => void)[] = [];
		let handlerCalls = 0;
		connector.peer.expose(descriptor, {
			run(value) {
				handlerCalls += 1;
				return new Promise<number>((resolve) => {
					handlerResolvers.push(() => resolve(value));
				});
			},
		});

		const reserve = (value: number) => {
			const reservation = sessionHost.reserveIncomingCall({
				service: "example.deferred.v1",
				method: "run",
				args: host.normalizeApplicationArguments([value]),
			});
			if (reservation?.kind !== "handler") {
				throw new Error("Expected a handler reservation.");
			}
			return reservation.reservation.commit();
		};
		const first = reserve(3);
		const second = reserve(7);
		await Promise.resolve();
		expect(handlerCalls).toBe(1);

		handlerResolvers[0]?.(3);
		const firstOutcome = await first.handlerOutcome;
		if (firstOutcome.type !== "returned") {
			throw new Error("Expected the first handler result.");
		}
		first.finish({ type: "returned", value: firstOutcome.value });
		await Promise.resolve();
		expect(handlerCalls).toBe(2);

		handlerResolvers[1]?.(7);
		const secondOutcome = await second.handlerOutcome;
		if (secondOutcome.type !== "returned") {
			throw new Error("Expected the second handler result.");
		}
		second.finish({ type: "returned", value: secondOutcome.value });
	});

	it("RPC-RESOURCE-001 rejects incoming work before route lookup when the args subcap is reserved", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { host, sessionHost, events } = await connectProtocolSession(
			session,
			{
				maxRetainedBytesPerSession: 4 * 1024 * 1024,
			},
		);
		const args = host.normalizeApplicationArguments([
			"a".repeat(500_000),
			"b".repeat(499_993),
		]);
		expect(args.weight).toBe(1_000_000);

		const request = {
			service: "unknown.service",
			method: "unknownMethod",
			args,
		};
		const first = sessionHost.reserveIncomingCall(request);
		expect(first?.kind).toBe("unknown");
		expect(sessionHost.reserveIncomingCall(request)).toBeUndefined();
		expect(
			events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);

		first?.reservation.release();
		const afterRelease = sessionHost.reserveIncomingCall(request);
		expect(afterRelease?.kind).toBe("unknown");
		afterRelease?.reservation.release();
	});

	it("RPC-CLOSE-001 consumes a terminal handler result without normalizing it", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			methods: { run: true },
		});
		let resolveHandler!: (value: number) => void;
		let inspectionCalls = 0;
		connector.peer.expose(descriptor, {
			run() {
				return new Promise<number>((resolve) => {
					resolveHandler = resolve;
				});
			},
		});
		const reserved = sessionHost.reserveIncomingCall({
			service: "example.deferred.v1",
			method: "run",
			args: host.normalizeApplicationArguments([1]),
		});
		if (reserved?.kind !== "handler") {
			throw new Error("Expected a known handler reservation.");
		}
		const call = reserved.reservation.commit();
		await Promise.resolve();
		call.finish({ type: "session-terminated" });

		resolveHandler(
			new Proxy(
				{},
				{
					getPrototypeOf() {
						inspectionCalls += 1;
						return Object.prototype;
					},
				},
			) as never,
		);
		await Promise.resolve();
		await Promise.resolve();

		expect(inspectionCalls).toBe(0);
		await connector.close();
	});
});

describe("Protocol Session state projection", () => {
	it("RPC-API-005 commits related Connector snapshots before terminal notifications and settles last", async () => {
		const harness = createProtocolHarness();
		const connector = createRpcConnector({ protocol: harness.protocol });
		let taskSettled = false;
		const observations: Array<{
			readonly source: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly taskSettled: boolean;
		}> = [];
		connector.state$.subscribe((state) => {
			if (state.status === "closing") {
				observations.push({
					source: "owner-state",
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});
		connector.peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observations.push({
					source: "peer-state",
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});
		connector.event$.subscribe((event) => {
			if (
				event.type === "peer-closed" ||
				event.type === "owner-closing" ||
				event.type === "topology-closed"
			) {
				observations.push({
					source: event.type,
					ownerStatus: connector.state.status,
					peerStatus: connector.peer.state.status,
					taskSettled,
				});
			}
		});

		const task = connector.close().then(() => {
			taskSettled = true;
		});
		await task;

		expect(observations.map(({ source }) => source)).toEqual([
			"owner-state",
			"peer-state",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(observations.slice(0, -1)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ownerStatus: "closing",
					peerStatus: "closed",
					taskSettled: false,
				}),
			]),
		);
		expect(observations.every(({ taskSettled: settled }) => !settled)).toBe(
			true,
		);
	});

	it("RPC-STATE-001 RPC-SPI-010 projects Connector recovery and terminal ordering on stable streams", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost, events } =
			await connectProtocolSession(session);
		let peerCompleted = false;
		let ownerCompleted = false;
		let eventCompleted = false;
		connector.peer.state$.subscribe({
			complete: () => {
				peerCompleted = true;
			},
		});
		connector.state$.subscribe({
			complete: () => {
				ownerCompleted = true;
			},
		});
		connector.event$.subscribe({
			complete: () => {
				eventCompleted = true;
			},
		});

		sessionHost.transition({ type: "recovering" });
		expect(connector.peer.state).toEqual({ status: "recovering" });
		sessionHost.transition({ type: "recovered" });
		expect(connector.peer.state).toEqual({ status: "connected" });
		sessionHost.transition({ type: "closed", reason: "remote-terminated" });

		expect(connector.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
		expect(connector.state).toEqual({ status: "closing" });
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-recovering",
			"peer-recovered",
			"peer-closed",
			"owner-closing",
		]);
		expect(peerCompleted).toBe(true);
		expect(ownerCompleted).toBe(false);
		expect(eventCompleted).toBe(false);

		await connector.shutdown();
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
		expect(events.map((event) => event.type)).toEqual([
			"peer-opened",
			"peer-recovering",
			"peer-recovered",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(ownerCompleted).toBe(true);
		expect(eventCompleted).toBe(true);
	});
});

describe("Topology Owner termination", () => {
	it("RPC-LIFE-001 RPC-LIFE-002 RPC-CLOSE-003 gives cold Connector shutdown and close distinct cached modes", async () => {
		const gracefulHarness = createProtocolHarness();
		const graceful = createRpcConnector({ protocol: gracefulHarness.protocol });
		const gracefulEvents: RpcEvent[] = [];
		graceful.event$.subscribe((event) => gracefulEvents.push(event));
		const gracefulTask = graceful.shutdown();
		expect(graceful.shutdown()).toBe(gracefulTask);
		await gracefulTask;
		expect(graceful.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(graceful.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(gracefulEvents.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(gracefulHarness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
		expect(graceful.close()).toBe(gracefulTask);

		const forcedHarness = createProtocolHarness();
		const forced = createRpcConnector({ protocol: forcedHarness.protocol });
		const forcedEvents: RpcEvent[] = [];
		forced.event$.subscribe((event) => forcedEvents.push(event));
		const forcedTask = forced.close();
		expect(forced.close()).toBe(forcedTask);
		expect(forced.shutdown()).toBe(forcedTask);
		await forcedTask;
		expect(forced.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forced.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forcedEvents.map((event) => event.type)).toEqual([
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(forcedHarness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-LIFE-001 RPC-LIFE-002 upgrades an in-progress graceful shutdown through the same Promise", async () => {
		let resolveShutdown: (() => void) | undefined;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					shutdown() {
						return new Promise<void>((resolve) => {
							resolveShutdown = resolve;
						});
					},
					close() {
						closeCalls += 1;
					},
					async cleanup() {
						cleanupCalls += 1;
					},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
		};
		const connector = createRpcConnector({ protocol });
		const task = connector.shutdown();
		expect(connector.state).toEqual({ status: "draining" });
		expect(connector.close()).toBe(task);
		await task;
		expect(closeCalls).toBe(1);
		expect(cleanupCalls).toBe(1);
		expect(connector.state).toMatchObject({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		resolveShutdown?.();
		await Promise.resolve();
		expect(closeCalls).toBe(1);
	});
});

describe("Acceptor Topology Owner termination", () => {
	it("RPC-LIFE-001 RPC-LIFE-002 RPC-CLOSE-003 gives an empty Acceptor distinct cached shutdown and close modes", async () => {
		const gracefulHarness = createProtocolHarness();
		const graceful = createRpcAcceptor({
			protocol: gracefulHarness.protocol,
		});
		const gracefulEvents: RpcEvent[] = [];
		graceful.event$.subscribe((event) => gracefulEvents.push(event));

		const gracefulTask = graceful.shutdown();
		expect(graceful.state).toEqual({ status: "draining" });
		expect(graceful.shutdown()).toBe(gracefulTask);
		await gracefulTask;

		expect(graceful.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(graceful.peers).toEqual([]);
		expect(gracefulEvents.map((event) => event.type)).toEqual([
			"owner-draining",
			"owner-closing",
			"topology-closed",
		]);
		expect(gracefulHarness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
		expect(graceful.close()).toBe(gracefulTask);

		const forcedHarness = createProtocolHarness();
		const forced = createRpcAcceptor({ protocol: forcedHarness.protocol });
		const forcedEvents: RpcEvent[] = [];
		forced.event$.subscribe((event) => forcedEvents.push(event));

		const forcedTask = forced.close();
		expect(forced.state).toEqual({ status: "closing" });
		expect(forced.close()).toBe(forcedTask);
		expect(forced.shutdown()).toBe(forcedTask);
		await forcedTask;

		expect(forced.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(forced.peers).toEqual([]);
		expect(forcedEvents.map((event) => event.type)).toEqual([
			"owner-closing",
			"topology-closed",
		]);
		expect(forcedHarness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 aborts and unsubscribes a ready listener before cleanup", async () => {
		const harness = createProtocolHarness();
		const connectionSource = new Subject<IRpcConnection>();
		let listenerSignal: AbortSignal | undefined;
		let listenerTeardowns = 0;
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });

		await acceptor.listen({
			connection$: new Observable<IRpcConnection>((subscriber) => {
				const subscription = connectionSource.subscribe(subscriber);
				return () => {
					listenerTeardowns += 1;
					subscription.unsubscribe();
				};
			}),
			async listen(signal) {
				listenerSignal = signal;
			},
		});
		expect(acceptor.state).toEqual({
			status: "active",
			listener: { status: "listening" },
		});

		const task = acceptor.shutdown();
		expect(listenerSignal?.aborted).toBe(true);
		expect(listenerTeardowns).toBe(1);
		connectionSource.next({
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {},
		});
		await task;

		expect(harness.calls.acceptorAccept).toBe(0);
		expect(harness.calls).toMatchObject({
			shutdown: 1,
			close: 0,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 rejects a starting listener with AbortError on forced close", async () => {
		const harness = createProtocolHarness();
		let listenerSignal: AbortSignal | undefined;
		let listenerTeardowns = 0;
		let resolveReady: (() => void) | undefined;
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });
		const startup = acceptor.listen({
			connection$: new Observable<IRpcConnection>(() => {
				return () => {
					listenerTeardowns += 1;
				};
			}),
			listen(signal) {
				listenerSignal = signal;
				return new Promise<void>((resolve) => {
					resolveReady = resolve;
				});
			},
		});
		const startupOutcome = startup.then(
			() => undefined,
			(error: unknown) => error,
		);

		const task = acceptor.close();
		expect(listenerSignal?.aborted).toBe(true);
		expect(listenerTeardowns).toBe(1);
		const startupError = await startupOutcome;
		expect(startupError).toBeInstanceOf(DOMException);
		expect(startupError).toMatchObject({ name: "AbortError" });
		await task;

		resolveReady?.();
		await Promise.resolve();
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(harness.calls).toMatchObject({
			shutdown: 0,
			close: 1,
			cleanup: 1,
		});
	});

	it("RPC-SHUTDOWN-001 rejects a Connection emitted reentrantly by listener abort", async () => {
		const harness = createProtocolHarness();
		const connectionSource = new Subject<IRpcConnection>();
		let connectionCloseCalls = 0;
		const connection: IRpcConnection = {
			message$: new Subject<Uint8Array>().asObservable(),
			async send() {},
			async close() {
				connectionCloseCalls += 1;
			},
		};
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen(signal) {
				signal.addEventListener(
					"abort",
					() => connectionSource.next(connection),
					{ once: true },
				);
			},
		});

		await acceptor.shutdown();
		await Promise.resolve();

		expect(harness.calls.acceptorAccept).toBe(0);
		expect(connectionCloseCalls).toBe(1);
	});

	it("RPC-SHUTDOWN-002 drains connected peers and locally forces recovering peers", async () => {
		let acceptorHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown: (() => void) | undefined;
		let shutdownCalls = 0;
		let closeCalls = 0;
		let cleanupCalls = 0;
		let recoveringForceCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor(host) {
				acceptorHost = host;
				return {
					async accept() {},
					shutdown() {
						shutdownCalls += 1;
						return new Promise<void>((resolve) => {
							resolveShutdown = resolve;
						});
					},
					close() {
						closeCalls += 1;
					},
					async cleanup() {
						cleanupCalls += 1;
					},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const connectedSession: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		const recoveringSession: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {
				recoveringForceCalls += 1;
			},
		};
		const connectedHost = acceptorHost?.admitSession(connectedSession);
		const recoveringHost = acceptorHost?.admitSession(recoveringSession);
		if (connectedHost === undefined || recoveringHost === undefined) {
			throw new Error("Expected both test Sessions to be admitted.");
		}
		const connectedPeer = acceptor.peers[0];
		const recoveringPeer = acceptor.peers[1];
		if (connectedPeer === undefined || recoveringPeer === undefined) {
			throw new Error("Expected both admitted peers.");
		}
		recoveringHost.transition({ type: "recovering" });
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));

		const task = acceptor.shutdown();
		expect(acceptor.state).toEqual({ status: "draining" });
		expect(connectedPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(recoveringPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(acceptor.peers).toEqual([connectedPeer]);
		expect(recoveringForceCalls).toBe(1);
		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 0,
			cleanupCalls: 0,
		});

		resolveShutdown?.();
		await task;

		expect(connectedPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
		expect(acceptor.peers).toEqual([]);
		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 0,
			cleanupCalls: 1,
		});
	});

	it("RPC-LIFE-001 RPC-LIFE-002 upgrades Acceptor drain through the same task and force path", async () => {
		let acceptorHost: IRpcProtocolAcceptorHost | undefined;
		let resolveShutdown: (() => void) | undefined;
		let shutdownCalls = 0;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor(host) {
				acceptorHost = host;
				return {
					async accept() {},
					shutdown() {
						shutdownCalls += 1;
						return new Promise<void>((resolve) => {
							resolveShutdown = resolve;
						});
					},
					close() {
						closeCalls += 1;
					},
					async cleanup() {
						cleanupCalls += 1;
					},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			forceClose() {},
		};
		if (acceptorHost?.admitSession(session) === undefined) {
			throw new Error("Expected the test Session to be admitted.");
		}
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted peer.");
		}
		const events: RpcEvent[] = [];
		const peerCloseSnapshots: Array<{
			readonly state: typeof acceptor.state;
			readonly peers: typeof acceptor.peers;
		}> = [];
		acceptor.event$.subscribe((event) => {
			if (event.type === "peer-closed") {
				peerCloseSnapshots.push({
					state: acceptor.state,
					peers: acceptor.peers,
				});
			}
			events.push(event);
		});

		const task = acceptor.shutdown();
		expect(acceptor.close()).toBe(task);
		expect(acceptor.state).toEqual({ status: "closing" });
		expect(peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		await task;

		expect(events.map((event) => event.type)).toEqual([
			"owner-draining",
			"peer-draining",
			"peer-closed",
			"owner-closing",
			"topology-closed",
		]);
		expect(peerCloseSnapshots).toEqual([
			{ state: { status: "closing" }, peers: [] },
		]);
		expect({ shutdownCalls, closeCalls, cleanupCalls }).toEqual({
			shutdownCalls: 1,
			closeCalls: 1,
			cleanupCalls: 1,
		});

		resolveShutdown?.();
		await Promise.resolve();
		expect({ closeCalls, cleanupCalls }).toEqual({
			closeCalls: 1,
			cleanupCalls: 1,
		});
	});

	it("RPC-LIFE-002 does not force Acceptor after graceful cleanup has started", async () => {
		let resolveCleanup: (() => void) | undefined;
		let closeCalls = 0;
		let cleanupCalls = 0;
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {
						closeCalls += 1;
					},
					cleanup() {
						cleanupCalls += 1;
						return new Promise<void>((resolve) => {
							resolveCleanup = resolve;
						});
					},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const task = acceptor.shutdown();
		await Promise.resolve();
		await Promise.resolve();
		expect(acceptor.state).toEqual({ status: "closing" });

		expect(acceptor.close()).toBe(task);
		expect({ closeCalls, cleanupCalls }).toEqual({
			closeCalls: 0,
			cleanupCalls: 1,
		});

		resolveCleanup?.();
		await task;
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 escalates an expired grace interval without rejecting termination", async () => {
		vi.useFakeTimers();
		try {
			let shutdownCalls = 0;
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocol: IRpcProtocol = {
				createConnector() {
					return {
						async bind() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
				createAcceptor() {
					return {
						async accept() {},
						shutdown() {
							shutdownCalls += 1;
							return new Promise<void>(() => {});
						},
						close() {
							closeCalls += 1;
						},
						async cleanup() {
							cleanupCalls += 1;
						},
					};
				},
			};
			const acceptor = createRpcAcceptor({
				protocol,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			let outcome: "pending" | "fulfilled" | "rejected" = "pending";
			const task = acceptor.shutdown();
			void task.then(
				() => {
					outcome = "fulfilled";
				},
				() => {
					outcome = "rejected";
				},
			);

			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "draining" });
			expect({ closeCalls, cleanupCalls, outcome }).toEqual({
				closeCalls: 0,
				cleanupCalls: 0,
				outcome: "pending",
			});

			await vi.advanceTimersByTimeAsync(1);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "shutdown-deadline",
			});
			expect({ shutdownCalls, closeCalls, cleanupCalls, outcome }).toEqual({
				shutdownCalls: 1,
				closeCalls: 1,
				cleanupCalls: 1,
				outcome: "fulfilled",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-001 gives shutdown separate non-sliding grace and cleanup intervals", async () => {
		vi.useFakeTimers();
		try {
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocol: IRpcProtocol = {
				createConnector() {
					return {
						async bind() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
				createAcceptor() {
					return {
						async accept() {},
						shutdown() {
							return new Promise<void>(() => {});
						},
						close() {
							closeCalls += 1;
						},
						cleanup() {
							cleanupCalls += 1;
							return new Promise<void>(() => {});
						},
					};
				},
			};
			const acceptor = createRpcAcceptor({
				protocol,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			const outcome = acceptor.shutdown().then(
				() => undefined,
				(error: unknown) => error,
			);

			await vi.advanceTimersByTimeAsync(10);
			expect(acceptor.state).toEqual({ status: "closing" });
			expect({ closeCalls, cleanupCalls }).toEqual({
				closeCalls: 1,
				cleanupCalls: 1,
			});
			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "closing" });
			await vi.advanceTimersByTimeAsync(1);

			const error = await outcome;
			expect(error).toBeInstanceOf(Error);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-001 RPC-CLEANUP-003 rejects a direct close at its independent cleanup deadline", async () => {
		vi.useFakeTimers();
		try {
			let resolveCleanup: (() => void) | undefined;
			let closeCalls = 0;
			let cleanupCalls = 0;
			const protocol: IRpcProtocol = {
				createConnector() {
					return {
						async bind() {},
						async shutdown() {},
						close() {},
						async cleanup() {},
					};
				},
				createAcceptor() {
					return {
						async accept() {},
						async shutdown() {},
						close() {
							closeCalls += 1;
						},
						cleanup() {
							cleanupCalls += 1;
							return new Promise<void>((resolve) => {
								resolveCleanup = resolve;
							});
						},
					};
				},
			};
			const acceptor = createRpcAcceptor({
				protocol,
				runtimePolicy: { shutdownDeadlineMs: 10 },
			});
			const task = acceptor.close();
			const outcome = task.then(
				() => undefined,
				(error: unknown) => error,
			);

			await vi.advanceTimersByTimeAsync(9);
			expect(acceptor.state).toEqual({ status: "closing" });
			await vi.advanceTimersByTimeAsync(1);
			const error = await outcome;

			expect(error).toBeInstanceOf(Error);
			expect(acceptor.state).toEqual({
				status: "closed",
				outcome: "failed",
				reason: "cleanup-failed",
				error,
			});
			expect({ closeCalls, cleanupCalls }).toEqual({
				closeCalls: 1,
				cleanupCalls: 1,
			});
			expect(acceptor.close()).toBe(task);

			resolveCleanup?.();
			await Promise.resolve();
			expect(acceptor.state).toMatchObject({
				status: "closed",
				reason: "cleanup-failed",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-CLEANUP-003 RPC-CLEANUP-004 preserves a trusted cleanup rejection and settles after stream completion", async () => {
		const cleanupError = new Error("acceptor cleanup failed");
		const protocol: IRpcProtocol = {
			createConnector() {
				return {
					async bind() {},
					async shutdown() {},
					close() {},
					async cleanup() {},
				};
			},
			createAcceptor() {
				return {
					async accept() {},
					async shutdown() {},
					close() {},
					async cleanup() {
						throw cleanupError;
					},
				};
			},
		};
		const acceptor = createRpcAcceptor({ protocol });
		const order: string[] = [];
		acceptor.state$.subscribe({
			next: (state) => {
				if (state.status === "closed") {
					order.push("state-closed");
				}
			},
			complete: () => order.push("state-complete"),
		});
		acceptor.peers$.subscribe({
			complete: () => order.push("peers-complete"),
		});
		acceptor.event$.subscribe({
			next: (event) => {
				if (event.type === "topology-closed") {
					order.push("topology-closed");
				}
			},
			complete: () => order.push("event-complete"),
		});

		const task = acceptor.close();
		const outcome = task.then(
			() => undefined,
			(error: unknown) => {
				order.push("task-rejected");
				return error;
			},
		);
		const error = await outcome;

		expect(error).toBe(cleanupError);
		expect(acceptor.state).toEqual({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: cleanupError,
		});
		expect(order).toEqual([
			"state-closed",
			"state-complete",
			"peers-complete",
			"topology-closed",
			"event-complete",
			"task-rejected",
		]);
		expect(acceptor.shutdown()).toBe(task);
	});
});
