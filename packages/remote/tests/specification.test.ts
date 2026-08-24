/**
 * @overview Remote RPC specification compliance tests.
 *
 * Each test names the normative requirement that it exercises.
 *
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { queryObjects } from "node:v8";

import { CodedException, createServiceIdentifier } from "@husky-di/core";
import { config, Observable, of, Subject, Subscriber } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import packageManifest from "../package.json";
import {
	type RpcConformanceCaseResult,
	RpcConformanceStatusEnum,
	runRpcProtocolConformance,
} from "../src/conformance";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcConnector,
	type IRpcConnectorAdapter,
	type IRpcProtocol,
	RpcAcceptorListenerStopReasonEnum,
	RpcCallStatusEnum,
	RpcCloseOutcomeEnum,
	RpcCloseReasonEnum,
	RpcConnectorReconnectionAttemptFailureStageEnum,
	RpcConnectorReconnectionEventTypeEnum,
	RpcConnectorReconnectionStopReasonEnum,
	type RpcConnectorRuntimePolicyOptions,
	type RpcEvent,
	RpcEventDirectionEnum,
	RpcEventTypeEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
	RpcStreamStatusEnum,
} from "../src/index";
import type {
	IRpcApplicationSnapshot,
	IRpcConnection,
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolIncomingStream,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
	IRpcProtocolSourceSink,
	IRpcProtocolStreamReservation,
	IRpcProtocolSubscriberSink,
	RpcIncomingStreamTerminal,
} from "../src/protocol";
import {
	createRpcProtocol,
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../src/protocol";
import { createMemoryProtocolFixture } from "./conformance/test.utils";
import { createRpcTestNetwork } from "./protocol/test.utils";

interface CalculatorService {
	add(left: number, right: number): number;
	cancel(value: string, signal: AbortSignal): Promise<string>;
}

interface MixedExposureService extends CalculatorService {
	history(room: string): Observable<string>;
	readonly events$: Observable<string>;
	readonly lazy$: Observable<string>;
}

interface CaseSensitiveService {
	Then(): void;
}

interface DeferredService {
	run(value: number): Promise<number>;
}

interface RetainedReplayService {
	run(left: string, right: string): Promise<void>;
}

const ICalculatorService =
	createServiceIdentifier<CalculatorService>("ICalculatorService");
const IMixedExposureService = createServiceIdentifier<MixedExposureService>(
	"IMixedExposureService",
);
const ICaseSensitiveService = createServiceIdentifier<CaseSensitiveService>(
	"ICaseSensitiveService",
);
const IDeferredService =
	createServiceIdentifier<DeferredService>("IDeferredService");
const IRetainedReplayService = createServiceIdentifier<RetainedReplayService>(
	"IRetainedReplayService",
);

const sessionCapacityPolicy = {
	ackDelayMs: 1,
	activityProbeIntervalMs: 10,
	silenceTimeoutMs: 30,
	bindingAttemptTimeoutMs: 100,
	recoveryGraceMs: 1_000,
};

let streamingConformanceReportTask:
	| Promise<readonly RpcConformanceCaseResult[]>
	| undefined;

function getStreamingConformanceReport(): Promise<
	readonly RpcConformanceCaseResult[]
> {
	streamingConformanceReportTask ??= (async () => {
		const reports: RpcConformanceCaseResult[] = [];
		await runRpcProtocolConformance(createMemoryProtocolFixture(), {
			report: (result) => reports.push(result),
		});
		return reports;
	})();
	return streamingConformanceReportTask;
}

async function expectStreamingConformanceCase(caseId: string): Promise<void> {
	const reports = await getStreamingConformanceReport();
	expect(reports.find((result) => result.caseId === caseId)).toEqual({
		caseId,
		status: RpcConformanceStatusEnum.passed,
	});
}

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
		adapter: {
			connection$: connectionSource.asObservable(),
			async connect() {
				connectionSource.next({
					message$: messageSource.asObservable(),
					async send() {},
					async close() {},
				});
				connectionSource.complete();
			},
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

function createW1SemanticStreamHarness(): {
	readonly session: IRpcProtocolSession;
	attachIncomingHost(host: IRpcProtocolSessionHost): void;
	flush(): void;
	setOrdinaryCapacityAvailable(available: boolean): void;
	readonly admittedItemCount: number;
	readonly creditThrough: number;
	readonly forceCloseCount: number;
	readonly released: boolean;
	readonly terminal: RpcIncomingStreamTerminal | undefined;
} {
	let incomingHost: IRpcProtocolSessionHost | undefined;
	let subscriberSink: IRpcProtocolSubscriberSink | undefined;
	let incomingStream: IRpcProtocolIncomingStream | undefined;
	let admittedItemCount = 0;
	let consumedCreditCount = 0;
	let creditThrough = 1;
	let forceCloseCount = 0;
	let terminal: RpcIncomingStreamTerminal | undefined;
	let terminalProjected = false;
	let released = false;
	let ordinaryCapacityAvailable = true;
	const pendingItems: IRpcApplicationSnapshot[] = [];

	const projectTerminal = (): void => {
		const selectedTerminal = terminal;
		const selectedSink = subscriberSink;
		// The protected terminal follows every previously admitted item.
		const terminalProjectionIsBlocked =
			selectedTerminal === undefined ||
			terminalProjected ||
			pendingItems.length > 0 ||
			selectedSink === undefined;
		if (terminalProjectionIsBlocked) {
			return;
		}
		terminalProjected = true;
		if (selectedTerminal.type === "session-terminated") {
			selectedSink
				.reserveTerminal({
					type: "failed",
					code: RpcExceptionCodeEnum.outcomeUnknown,
				})
				.commit();
			return;
		}
		selectedSink.reserveTerminal(selectedTerminal).commit();
	};
	const selectTerminal = (outcome: RpcIncomingStreamTerminal): void => {
		if (terminal !== undefined) {
			return;
		}
		terminal = outcome;
		incomingStream?.finish(outcome, () => {
			released = true;
		});
		projectTerminal();
	};
	const sourceSink: IRpcProtocolSourceSink = {
		reserveEmission() {
			if (terminal !== undefined) {
				return undefined;
			}
			if (consumedCreditCount >= creditThrough) {
				selectTerminal({
					type: "failed",
					code: RpcExceptionCodeEnum.overflow,
				});
				return undefined;
			}
			consumedCreditCount += 1;
			if (!ordinaryCapacityAvailable) {
				selectTerminal({
					type: "failed",
					code: RpcExceptionCodeEnum.overflow,
				});
				return undefined;
			}
			let open = true;
			return {
				commit(snapshot) {
					if (!open || terminal !== undefined) {
						return;
					}
					open = false;
					admittedItemCount += 1;
					pendingItems.push(snapshot);
				},
				fail() {
					if (!open || terminal !== undefined) {
						return;
					}
					open = false;
					selectTerminal({
						type: "failed",
						code: RpcExceptionCodeEnum.handlerFailed,
					});
				},
			};
		},
		finish(outcome) {
			selectTerminal(outcome);
		},
	};
	const session: IRpcProtocolSession = {
		reserveInvocation: () => undefined,
		reserveStream(nextRequest) {
			return {
				commit(nextSubscriberSink) {
					subscriberSink = nextSubscriberSink;
					return {
						start() {
							const reservation =
								incomingHost?.reserveIncomingStream(nextRequest);
							if (reservation?.kind !== "source") {
								nextSubscriberSink
									.reserveTerminal({
										type: "failed",
										code: RpcExceptionCodeEnum.unavailable,
									})
									.commit();
								return;
							}
							incomingStream = reservation.reservation.commit(sourceSink);
						},
						cancel() {
							selectTerminal({ type: "canceled" });
						},
					};
				},
				release() {},
			};
		},
		forceClose() {
			forceCloseCount += 1;
			selectTerminal({ type: "session-terminated" });
		},
	};

	return {
		session,
		attachIncomingHost(host) {
			incomingHost = host;
		},
		flush() {
			while (pendingItems.length > 0) {
				const snapshot = pendingItems.shift();
				if (snapshot === undefined || subscriberSink === undefined) {
					break;
				}
				const effect = subscriberSink.reserveItem(snapshot).commit();
				if (effect === "rearm" && terminal === undefined) {
					creditThrough += 1;
				}
			}
			projectTerminal();
		},
		setOrdinaryCapacityAvailable(available) {
			ordinaryCapacityAvailable = available;
		},
		get admittedItemCount() {
			return admittedItemCount;
		},
		get creditThrough() {
			return creditThrough;
		},
		get forceCloseCount() {
			return forceCloseCount;
		},
		get released() {
			return released;
		},
		get terminal() {
			return terminal;
		},
	};
}

function createReconnectionProtocolHarness(): {
	readonly protocol: IRpcProtocol;
	readonly sessionHost: () => IRpcProtocolSessionHost;
} {
	const session: IRpcProtocolSession = {
		reserveInvocation: () => undefined,
		reserveStream: () => undefined,
		forceClose() {},
	};
	let retainedSessionHost: IRpcProtocolSessionHost | undefined;
	const protocol: IRpcProtocol = {
		createConnector(host) {
			return {
				bind() {
					return Promise.resolve().then(() => {
						if (retainedSessionHost === undefined) {
							retainedSessionHost = host.attachSession(session);
							if (retainedSessionHost === undefined) {
								throw new Error("The test Session was not attached.");
							}
							return;
						}
						retainedSessionHost.transition({
							type: RpcProtocolSessionTransitionTypeEnum.recovered,
						});
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

	return {
		protocol,
		sessionHost: () => {
			if (retainedSessionHost === undefined) {
				throw new Error("The test Session has not been attached.");
			}
			return retainedSessionHost;
		},
	};
}

function createSuccessfulConnectorAdapter(): IRpcConnectorAdapter {
	const connectionSource = new Subject<IRpcConnection>();
	return {
		connection$: connectionSource.asObservable(),
		async connect() {
			connectionSource.next({
				message$: new Subject<Uint8Array>().asObservable(),
				async send() {},
				async close() {},
			});
			connectionSource.complete();
		},
	};
}

describe("Remote Service Descriptor", () => {
	it("RPC-DESC-001 RPC-DESC-006 creates an opaque mixed-member Descriptor", () => {
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.mixed.v1",
			members: {
				add: { kind: "unary" },
				cancel: { kind: "unary", cancelable: true },
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
				lazy$: { kind: "stream-property" },
			},
		});

		expect(descriptor).toBeTypeOf("object");
		expect(Object.getPrototypeOf(descriptor)).toBeNull();
		expect(Object.isFrozen(descriptor)).toBe(true);
		expect("serviceIdentifier" in descriptor).toBe(false);
		expect("wireName" in descriptor).toBe(false);
		expect("members" in descriptor).toBe(false);
	});

	it.each([
		[
			"an empty wire name",
			{ wireName: "", members: { add: { kind: "unary" } } },
		],
		["an empty allowlist", { wireName: "example.calculator.v1", members: {} }],
		[
			"the retired methods option",
			{ wireName: "example.calculator.v1", methods: { add: true } },
		],
		[
			"an empty member name",
			{
				wireName: "example.calculator.v1",
				members: { "": { kind: "unary" } },
			},
		],
		[
			"the reserved then member",
			{
				wireName: "example.calculator.v1",
				members: {
					// biome-ignore lint/suspicious/noThenProperty: verifies the reserved method rejection.
					then: { kind: "unary" },
				},
			},
		],
		[
			"a boolean shorthand",
			{ wireName: "example.calculator.v1", members: { add: true } },
		],
		[
			"an extra definition field",
			{
				wireName: "example.calculator.v1",
				members: { add: { kind: "unary", extra: true } },
			},
		],
		[
			"cancelable false",
			{
				wireName: "example.calculator.v1",
				members: { cancel: { kind: "unary", cancelable: false } },
			},
		],
		[
			"an unknown interaction kind",
			{
				wireName: "example.calculator.v1",
				members: { add: { kind: "batch" } },
			},
		],
		[
			"an extra stream definition field",
			{
				wireName: "example.calculator.v1",
				members: { events$: { kind: "stream-property", extra: true } },
			},
		],
		[
			"a non-dollar stream property",
			{
				wireName: "example.calculator.v1",
				members: { events: { kind: "stream-property" } },
			},
		],
		[
			"an extra outer option",
			{
				wireName: "example.calculator.v1",
				members: { add: { kind: "unary" } },
				extra: true,
			},
		],
	])("RPC-DESC-006 RPC-DESC-009 rejects %s", (_label, options) => {
		expect(() =>
			createRemoteServiceDescriptor(ICalculatorService, options as never),
		).toThrow(TypeError);
	});

	it("RPC-DESC-006 rejects accessors without invoking them", () => {
		let getterCalls = 0;
		const accessorOptions = Object.defineProperty(
			{ members: { add: { kind: "unary" } } },
			"wireName",
			{
				enumerable: true,
				get() {
					getterCalls += 1;
					return "example.accessor.v1";
				},
			},
		);

		expect(() =>
			createRemoteServiceDescriptor(
				ICalculatorService,
				accessorOptions as never,
			),
		).toThrow(TypeError);
		expect(getterCalls).toBe(0);
	});

	it("RPC-DESC-006 rejects member and definition accessors or symbol fields without invoking application code", () => {
		let getterCalls = 0;
		const accessorMembers = Object.defineProperty({}, "add", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return { kind: "unary" };
			},
		});
		const accessorDefinition = Object.defineProperty({}, "kind", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return "unary";
			},
		});
		const symbol = Symbol("extra");
		const symbolMembers = {
			add: { kind: "unary" },
			[symbol]: { kind: "unary" },
		};
		const symbolDefinition = {
			kind: "unary",
			[symbol]: true,
		};

		for (const members of [
			accessorMembers,
			{ add: accessorDefinition },
			symbolMembers,
			{ add: symbolDefinition },
		]) {
			expect(() =>
				createRemoteServiceDescriptor(ICalculatorService, {
					wireName: "example.invalid-members.v1",
					members,
				} as never),
			).toThrow(TypeError);
		}
		expect(getterCalls).toBe(0);
	});

	it("RPC-DESC-009 compares member names exactly", () => {
		expect(() =>
			createRemoteServiceDescriptor(ICaseSensitiveService, {
				wireName: "example.case-sensitive.v1",
				members: { Then: { kind: "unary" } },
			}),
		).not.toThrow();
	});

	it("RPC-DESC-001 RPC-DESC-006 retains a detached normalized snapshot", () => {
		const members = { add: { kind: "unary" as const } };
		const options = {
			wireName: "example.snapshot.v1",
			members,
		};
		const descriptor = createRemoteServiceDescriptor(
			ICalculatorService,
			options,
		);
		options.wireName = "example.replacement.v1";
		(members.add as { kind: string }).kind = "stream-property";

		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		const implementation = {
			add: (left: number, right: number) => left + right,
		};
		const cleanup = connector.peer.expose(descriptor, implementation);
		const originalNameDescriptor = createRemoteServiceDescriptor(
			ICalculatorService,
			{
				wireName: "example.snapshot.v1",
				members: { add: { kind: "unary" } },
			},
		);

		expect(() =>
			connector.peer.expose(originalNameDescriptor, implementation),
		).toThrow(TypeError);
		cleanup();
	});
});

describe("cold Topology Owner factories", () => {
	it("RPC-PKG-003 exposes the immutable built-in Protocol factory through the implementor entry", () => {
		const protocol = createRpcProtocol();
		const connector = createRpcConnector({ protocol });

		expect(Object.isFrozen(protocol)).toBe(true);
		expect(createRpcProtocol()).toBe(protocol);
		expect(connector.state).toEqual({ status: "active" });
	});

	it("RPC-PKG-005 exposes portable package metadata", () => {
		expect(packageManifest).toMatchObject({
			type: "module",
			sideEffects: false,
			engines: { node: ">=23.6" },
			publishConfig: { access: "public" },
			files: [
				"dist",
				"wire",
				"docs/ARCHITECTURE.drawio",
				"docs/ARCHITECTURE.png",
				"docs/PROTOCOL.md",
				"docs/REQUIREMENTS.md",
				"docs/SPECIFICATION.md",
				"docs/TRANSPORT.md",
				"README.md",
				"CHANGELOG.md",
				"LICENSE",
			],
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

	it("RPC-POLICY-005 RPC-POLICY-006 RPC-POLICY-007 RPC-POLICY-008 passes the exact frozen role defaults to the Protocol", () => {
		const connectorHarness = createProtocolHarness();
		createRpcConnector({ protocol: connectorHarness.protocol });
		const acceptorHarness = createProtocolHarness();
		createRpcAcceptor({ protocol: acceptorHarness.protocol });

		expect(connectorHarness.connectorHosts[0]?.policy).toEqual({
			maxSessions: 1,
			maxHandshakes: 1,
			maxApplicationWorkPerSession: 256,
			maxApplicationWorkTotal: 256,
			maxActiveStreamsPerSession: 16,
			maxActiveStreamsTotal: 16,
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
			maxApplicationWorkTotal: 1_024,
			maxActiveStreamsTotal: 64,
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

	it("RPC-SPI-003 RPC-RESOURCE-003 exposes an atomic idempotent Owner retained-byte port", () => {
		const harness = createProtocolHarness();
		createRpcConnector({ protocol: harness.protocol });
		const host = harness.connectorHosts[0];
		if (host === undefined) {
			throw new Error("Expected the Connector Protocol host.");
		}
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
	});

	it("RPC-API-001 RPC-POLICY-005 RPC-POLICY-006 RPC-POLICY-007 snapshots overrides and derives Connector totals", () => {
		const harness = createProtocolHarness();
		const runtimePolicy = {
			maxApplicationWorkPerSession: 8,
			maxActiveStreamsPerSession: 4,
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
			maxApplicationWorkPerSession: 8,
			maxApplicationWorkTotal: 8,
			maxActiveStreamsPerSession: 4,
			maxActiveStreamsTotal: 4,
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
					maxApplicationWorkPerSession: value,
				} as never,
			}),
		).toThrow(TypeError);
		expect(harness.connectorHosts).toHaveLength(0);
	});

	it("RPC-API-001 RPC-POLICY-003 accepts the platform timer boundary and rejects every timing-field overflow", () => {
		const maximumTimerDelayMs = 2_147_483_647;
		const maximumProbeIntervalMs = Math.floor(maximumTimerDelayMs / 3);
		const validHarness = createProtocolHarness();
		expect(() =>
			createRpcConnector({
				protocol: validHarness.protocol,
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
						protocol: harness.protocol,
						runtimePolicy: testCase.runtimePolicy,
					}),
				testCase.key,
			).toThrow(testCase.key);
			expect(harness.connectorHosts, testCase.key).toHaveLength(0);
		}
	});

	it("RPC-API-001 RPC-POLICY-008 RPC-POLICY-009 rejects closed-schema and cross-field violations before Protocol construction", () => {
		const cases: readonly unknown[] = [
			{ unknown: true },
			{ runtimePolicy: { unknown: 1 } },
			{ runtimePolicy: { maxSessions: 2 } },
			{ runtimePolicy: { maxApplicationWorkTotal: 2 } },
			{ runtimePolicy: { maxActiveStreamsTotal: 2 } },
			{ runtimePolicy: { maxPendingInvocationsPerSession: 2 } },
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
					maxApplicationWorkPerSession: 257,
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

	it("RPC-POLICY-009 validates Application Work and Active Stream equality boundaries without repair", () => {
		const validHarness = createProtocolHarness();
		createRpcAcceptor({
			protocol: validHarness.protocol,
			runtimePolicy: {
				maxApplicationWorkPerSession: 8,
				maxApplicationWorkTotal: 8,
				maxActiveStreamsPerSession: 8,
				maxActiveStreamsTotal: 8,
			},
		});
		expect(validHarness.acceptorHosts).toHaveLength(1);

		for (const runtimePolicy of [
			{ maxApplicationWorkPerSession: 8, maxApplicationWorkTotal: 7 },
			{ maxApplicationWorkPerSession: 8, maxActiveStreamsPerSession: 9 },
			{
				maxApplicationWorkPerSession: 8,
				maxApplicationWorkTotal: 16,
				maxActiveStreamsPerSession: 8,
				maxActiveStreamsTotal: 7,
			},
			{
				maxApplicationWorkPerSession: 8,
				maxApplicationWorkTotal: 16,
				maxActiveStreamsPerSession: 8,
				maxActiveStreamsTotal: 17,
			},
		]) {
			const harness = createProtocolHarness();
			expect(() =>
				createRpcAcceptor({ protocol: harness.protocol, runtimePolicy }),
			).toThrow(TypeError);
			expect(harness.acceptorHosts).toHaveLength(0);
		}
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

describe("Default Protocol aggregate retained capacity", () => {
	it("RPC-RESOURCE-002 RPC-RESOURCE-003 RPC-POLICY-002 enforces retained bytes across two Sessions", async () => {
		const mebibyte = 1024 * 1024;
		const descriptor = createRemoteServiceDescriptor(IRetainedReplayService, {
			wireName: "example.retained-replay.v1",
			members: { run: { kind: "unary" } },
		});
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: {
				maxSessions: 2,
				maxRetainedBytesPerSession: 4 * mebibyte,
				maxRetainedBytesTotal: 4 * mebibyte + 512 * 1024,
			},
		});
		const connectors = [
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
		];
		const neverSettles = () => new Promise<void>(() => {});
		for (const connector of connectors) {
			connector.peer.expose(descriptor, { run: neverSettles });
		}

		try {
			await acceptor.listen(network.acceptorAdapter);
			for (const connector of connectors) {
				await connector.connect({ adapter: network.createConnectorAdapter() });
			}
			const remotes = acceptor.peers.map((peer) => peer.resolve(descriptor));
			const [firstRemote, secondRemote] = remotes;
			if (firstRemote === undefined || secondRemote === undefined) {
				throw new Error("Expected two retained Sessions.");
			}
			network.setInterceptor((record) =>
				record.direction === "connector" ? { drop: true } : undefined,
			);
			const payload = "x".repeat(475_000);
			const retainedCalls = [
				firstRemote.run(payload, payload),
				secondRemote.run(payload, payload),
				firstRemote.run(payload, payload),
			];
			for (const call of retainedCalls) {
				void call.catch(() => {});
			}
			await vi.waitFor(() =>
				expect(
					network.records.filter(
						(record) =>
							record.direction === "acceptor" &&
							record.value.kind === "message" &&
							(record.value.message as { kind?: unknown }).kind === "call",
					).length,
				).toBe(3),
			);

			await expect(secondRemote.run(payload, payload)).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.unavailable,
			});
		} finally {
			await Promise.allSettled([
				...connectors.map((connector) => connector.close()),
				acceptor.close(),
			]);
		}
	});

	it("RPC-RESOURCE-001 RPC-RESOURCE-002 RPC-RESOURCE-003 RPC-POLICY-002 isolates each Session aggregate from remaining Owner capacity", async () => {
		const mebibyte = 1024 * 1024;
		const descriptor = createRemoteServiceDescriptor(IRetainedReplayService, {
			wireName: "example.session-retained.v1",
			members: { run: { kind: "unary" } },
		});
		const acceptedCalls: string[] = [];
		const network = createRpcTestNetwork();
		const blockedSend = Promise.withResolvers<void>();
		let retainedCallCount = 0;
		const acceptor = createRpcAcceptor({
			runtimePolicy: {
				maxSessions: 2,
				maxRetainedBytesPerSession: 4 * mebibyte,
				maxRetainedBytesTotal: 9 * mebibyte,
			},
		});
		acceptor.expose(descriptor, {
			run: async (left) => {
				acceptedCalls.push(left);
			},
		});
		const connectors = [
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
			createRpcConnector({
				runtimePolicy: { maxRetainedBytesPerSession: 4 * mebibyte },
			}),
		];
		connectors[0]?.peer.expose(descriptor, {
			run: () => new Promise<void>(() => {}),
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			for (const connector of connectors) {
				await connector.connect({ adapter: network.createConnectorAdapter() });
			}
			const [firstConnector, secondConnector] = connectors;
			const firstRemote = acceptor.peers[0]?.resolve(descriptor);
			if (
				firstConnector === undefined ||
				secondConnector === undefined ||
				firstRemote === undefined
			) {
				throw new Error("Expected two retained Sessions.");
			}

			network.setInterceptor((record) => {
				if (record.connectionId !== 1) {
					return undefined;
				}
				if (record.direction === "connector" && record.value.kind === "ack") {
					return { drop: true };
				}
				const message = record.value.message as { readonly kind?: unknown };
				if (
					record.direction === "connector" &&
					record.value.kind === "message" &&
					message.kind === "call"
				) {
					return {
						message: new TextEncoder().encode(
							JSON.stringify({ ...record.value, ackThrough: 0 }),
						),
					};
				}
				if (
					record.direction === "acceptor" &&
					record.value.kind === "message" &&
					message.kind === "call"
				) {
					retainedCallCount += 1;
					if (retainedCallCount === 2) {
						return { settlement: blockedSend.promise };
					}
				}
				return undefined;
			});

			const payload = "x".repeat(475_000);
			const retainedCalls = [
				firstRemote.run(payload, payload),
				firstRemote.run(payload, payload),
			];
			for (const call of retainedCalls) {
				void call.catch(() => {});
			}
			await vi.waitFor(() => expect(retainedCallCount).toBe(2));
			const pendingCall = firstRemote.run(payload, payload);
			void pendingCall.catch(() => {});

			const rejectedCall = firstConnector.peer
				.resolve(descriptor)
				.run(payload, payload);
			const probeCall = firstConnector.peer
				.resolve(descriptor)
				.run("probe", "");
			void rejectedCall.catch(() => {});
			void probeCall.catch(() => {});
			await vi.waitFor(() => expect(acceptedCalls).toContain("probe"));
			expect(acceptedCalls).toEqual(["probe"]);

			await expect(
				secondConnector.peer.resolve(descriptor).run("other-session", ""),
			).resolves.toBeUndefined();
			expect(acceptedCalls).toEqual(["probe", "other-session"]);

			blockedSend.resolve();
			await expect(rejectedCall).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.unavailable,
			});
			await expect(probeCall).resolves.toBeUndefined();
		} finally {
			blockedSend.resolve();
			await Promise.allSettled([
				...connectors.map((connector) => connector.close()),
				acceptor.close(),
			]);
		}
	});
});

describe("Default Protocol Session capacity", () => {
	it("RPC-RESOURCE-006 reclaims Recovery episodes by disconnection time rather than Session creation order", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 2 },
		});
		const laterDisconnectedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const firstDisconnectedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await laterDisconnectedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			await firstDisconnectedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const [laterDisconnectedPeer, firstDisconnectedPeer] = acceptor.peers;
			if (
				laterDisconnectedPeer === undefined ||
				firstDisconnectedPeer === undefined
			) {
				throw new Error("Expected two retained Peers.");
			}
			network.setInterceptor((record) =>
				record.connectionId === 2 ? { drop: true } : undefined,
			);

			await vi.advanceTimersByTimeAsync(30);

			expect(laterDisconnectedPeer.state).toEqual({ status: "connected" });
			expect(firstDisconnectedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(() => ({ drop: true }));
			await vi.advanceTimersByTimeAsync(30);
			expect(laterDisconnectedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(undefined);

			await freshConnector.connect({
				adapter: network.createConnectorAdapter(),
			});

			expect(firstDisconnectedPeer.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "forced-close",
			});
			expect(laterDisconnectedPeer.state).toEqual({ status: "recovering" });
			expect(acceptor.peers).toContain(laterDisconnectedPeer);
			expect(acceptor.peers).not.toContain(firstDisconnectedPeer);
			expect(acceptor.peers).toHaveLength(2);
		} finally {
			await Promise.allSettled([
				laterDisconnectedConnector.close(),
				firstDisconnectedConnector.close(),
				freshConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
	});

	it("RPC-SESSION-003 RPC-RECOVERY-003 RPC-RESOURCE-006 reclaims a recovering Session for fresh admission at capacity", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 1 },
		});
		const retainedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const overflowConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await retainedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const retainedPeer = acceptor.peers[0];
			if (retainedPeer === undefined) {
				throw new Error("Expected one retained Peer.");
			}
			network.setInterceptor(() => ({ drop: true }));

			await vi.advanceTimersByTimeAsync(30);

			expect(retainedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor(undefined);
			const freshAttempts = await Promise.allSettled([
				freshConnector.connect({ adapter: network.createConnectorAdapter() }),
				overflowConnector.connect({
					adapter: network.createConnectorAdapter(),
				}),
			]);

			expect(
				freshAttempts.filter((attempt) => attempt.status === "fulfilled"),
			).toHaveLength(1);
			expect(
				freshAttempts.find((attempt) => attempt.status === "rejected"),
			).toMatchObject({ reason: { code: "unavailable" } });
			expect(retainedPeer.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "forced-close",
			});
			expect(acceptor.peers).toHaveLength(1);
			expect(acceptor.peers).not.toContain(retainedPeer);
			expect(
				[freshConnector.peer, overflowConnector.peer].filter(
					(peer) => peer.state.status === "connected",
				),
			).toHaveLength(1);
			expect(retainedConnector.peer.state).toEqual({ status: "recovering" });

			await vi.advanceTimersByTimeAsync(999);
			expect(retainedConnector.peer.state).toEqual({ status: "recovering" });
			await vi.advanceTimersByTimeAsync(1);
			expect(retainedConnector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "recovery-expired",
				error: { code: "unavailable" },
			});
		} finally {
			await Promise.allSettled([
				retainedConnector.close(),
				freshConnector.close(),
				overflowConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
	});

	it("RPC-SESSION-003 RPC-SESSION-009 RPC-RECOVERY-003 RPC-RESOURCE-006 protects a linearized replacement binding from fresh pressure", async () => {
		vi.useFakeTimers();
		const network = createRpcTestNetwork();
		const acceptSettlement = Promise.withResolvers<void>();
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ...sessionCapacityPolicy, maxSessions: 1 },
		});
		const retainedConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});
		const freshConnector = createRpcConnector({
			runtimePolicy: sessionCapacityPolicy,
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await retainedConnector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
			const retainedPeer = acceptor.peers[0];
			if (retainedPeer === undefined) {
				throw new Error("Expected one retained Peer.");
			}
			network.setInterceptor(() => ({ drop: true }));
			await vi.advanceTimersByTimeAsync(30);
			expect(retainedPeer.state).toEqual({ status: "recovering" });
			network.setInterceptor((record) =>
				record.connectionId === 2 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept" &&
				!("sessionSecret" in record.value)
					? { settlement: acceptSettlement.promise }
					: undefined,
			);

			await retainedConnector.connect({
				adapter: network.createConnectorAdapter(),
			});

			expect(retainedPeer.state).toEqual({ status: "recovering" });
			await expect(
				freshConnector.connect({
					adapter: network.createConnectorAdapter(),
				}),
			).rejects.toMatchObject({ code: "unavailable" });
			expect(acceptor.peers).toEqual([retainedPeer]);
			expect(retainedPeer.state).toEqual({ status: "recovering" });

			acceptSettlement.resolve();
			await vi.advanceTimersByTimeAsync(0);
			expect(retainedPeer.state).toEqual({ status: "connected" });
		} finally {
			acceptSettlement.resolve();
			await Promise.allSettled([
				retainedConnector.close(),
				freshConnector.close(),
				acceptor.close(),
			]);
			vi.useRealTimers();
		}
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
	it("RPC-DESC-005 RPC-DESC-009 installs exposures atomically and cleans them up idempotently", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: {
				add: { kind: "unary" },
				cancel: { kind: "unary", cancelable: true },
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

	it("RPC-DESC-008 captures mixed method routes and data-property sources without reading getters", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.mixed-exposure.v1",
			members: {
				add: { kind: "unary" },
				cancel: { kind: "unary", cancelable: true },
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
				lazy$: { kind: "stream-property" },
			},
		});
		const source = new Subject<string>();
		let getterCalls = 0;
		const implementation = {
			add: (left: number, right: number) => left + right,
			async cancel(value: string) {
				return value;
			},
			history: (room: string) => of(room),
			events$: source,
		};
		Object.defineProperty(implementation, "lazy$", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return of("lazy");
			},
		});

		const cleanup = connector.peer.expose(
			descriptor,
			implementation as unknown as MixedExposureService,
		);
		expect(getterCalls).toBe(0);
		implementation.history = () => of("replacement");
		implementation.events$ = {} as Subject<string>;
		expect(cleanup()).toBeUndefined();
		expect(cleanup()).toBeUndefined();
	});

	it("RPC-DESC-008 rejects invalid mixed routes before installing any route", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.invalid-mixed-exposure.v1",
			members: {
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
			},
		});
		const validImplementation = {
			history: () => of("valid"),
			events$: of("valid"),
		};
		const invalidImplementation = {
			history: () => of("invalid"),
			events$: {},
		};

		expect(() =>
			connector.peer.expose(descriptor, invalidImplementation as never),
		).toThrow(TypeError);
		expect(() =>
			connector.peer.expose(descriptor, validImplementation as never),
		).not.toThrow();
	});

	it("RPC-DESC-008 rejects method accessors and stream-property setters without invoking getters", () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.invalid-accessor-exposure.v1",
			members: {
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
			},
		});
		let getterCalls = 0;
		const methodAccessor = { events$: of("event") };
		Object.defineProperty(methodAccessor, "history", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return () => of("history");
			},
		});
		const propertySetter = { history: () => of("history") };
		Object.defineProperty(propertySetter, "events$", {
			enumerable: true,
			get() {
				getterCalls += 1;
				return of("event");
			},
			set(_value: Observable<string>) {},
		});

		for (const implementation of [methodAccessor, propertySetter]) {
			expect(() =>
				connector.peer.expose(descriptor, implementation as never),
			).toThrow(TypeError);
		}
		expect(getterCalls).toBe(0);
	});

	it("RPC-CALL-010 creates a frozen non-thenable single-peer facade", async () => {
		const connectorHarness = createProtocolHarness();
		const connector = createRpcConnector({
			protocol: connectorHarness.protocol,
		});
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.mixed-facade.v1",
			members: {
				add: { kind: "unary" },
				cancel: { kind: "unary", cancelable: true },
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
				lazy$: { kind: "stream-property" },
			},
		});

		const remote = connector.peer.resolve(descriptor);
		expect(Object.getPrototypeOf(remote)).toBeNull();
		expect(Object.isFrozen(remote)).toBe(true);
		expect(Object.keys(remote)).toEqual([
			"add",
			"cancel",
			"history",
			"events$",
			"lazy$",
		]);
		expect(remote.then).toBeUndefined();
		expect(await Promise.resolve(remote)).toBe(remote);
		expect(remote.add).toBe(remote.add);
		expect(remote.cancel).toBe(remote.cancel);
		expect(remote.history).toBe(remote.history);
		expect(remote.events$).toBe(remote.events$);
		expect(remote.lazy$).toBe(remote.lazy$);
		expect(remote.history("first")).not.toBe(remote.history("first"));
		expect(Reflect.get(remote.events$, "then")).toBeUndefined();

		const { add, history } = remote;
		expect(history("destructured")).toBeInstanceOf(Observable);
		await expect(add(1, 2)).rejects.toMatchObject({ code: "unavailable" });
	});

	it("RPC-CALL-011 keeps facade creation reads and retention state-neutral", async () => {
		let reservationCalls = 0;
		const { connector } = await connectProtocolSession({
			reserveInvocation() {
				reservationCalls += 1;
				return undefined;
			},
			reserveStream: () => undefined,
			forceClose() {},
		});
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.state-neutral-facade.v1",
			members: {
				add: { kind: "unary" },
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
			},
		});
		let argumentReads = 0;
		const argument = Object.defineProperty({}, "room", {
			enumerable: true,
			get() {
				argumentReads += 1;
				return "room";
			},
		});

		const remote = connector.peer.resolve(descriptor);
		const history$ = remote.history(argument as unknown as string);
		const events$ = remote.events$;
		expect(await Promise.resolve(remote)).toBe(remote);
		expect(argumentReads).toBe(0);
		expect(reservationCalls).toBe(0);
		expect(history$).toBeInstanceOf(Observable);
		expect(events$).toBeInstanceOf(Observable);
		expect(Object.getOwnPropertyDescriptor(remote, "events$")).toMatchObject({
			value: events$,
			enumerable: true,
		});

		await connector.close();
		expect(() => connector.peer.resolve(descriptor)).not.toThrow();
		expect(() => remote.history("after-close")).not.toThrow();
		expect(() => remote.events$).not.toThrow();
		expect(history$).toBeDefined();
	});

	it("RPC-STREAM-001 RPC-STREAM-002 creates an independent cold root for every subscription", async () => {
		const requests: unknown[] = [];
		const argumentSnapshots: unknown[] = [];
		const sinks: IRpcProtocolSubscriberSink[] = [];
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream(request): IRpcProtocolStreamReservation {
				requests.push(request);
				if (request.kind === "stream-method") {
					argumentSnapshots.push(request.args);
				}
				return {
					commit(sink) {
						sinks.push(sink);
						return {
							start() {
								sink
									.reserveItem({
										value: `item-${sinks.length}`,
										weight: 6,
									} as never)
									.commit();
								sink.reserveTerminal({ type: "completed" }).commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.cold-stream.v1",
			members: { history: { kind: "stream-method" } },
		});
		const remote = connector.peer.resolve(descriptor);
		const history$ = remote.history("room");
		const first: string[] = [];
		const second: string[] = [];

		expect(requests).toEqual([]);
		history$.subscribe((value) => first.push(value));
		history$.subscribe((value) => second.push(value));

		expect(requests).toHaveLength(2);
		expect(argumentSnapshots).toHaveLength(2);
		expect(argumentSnapshots[0]).not.toBe(argumentSnapshots[1]);
		expect(sinks).toHaveLength(2);
		expect(first).toEqual(["item-1"]);
		expect(second).toEqual(["item-2"]);
		await connector.close();
		let argumentReads = 0;
		const rejectedArgument = Object.defineProperty({}, "room", {
			enumerable: true,
			get() {
				argumentReads += 1;
				return "rejected";
			},
		});
		let rejectedError: unknown;
		remote.history(rejectedArgument as never).subscribe({
			error: (error) => {
				rejectedError = error;
			},
		});
		expect(argumentReads).toBe(0);
		expect(requests).toHaveLength(2);
		expect(rejectedError).toMatchObject({
			code: RpcExceptionCodeEnum.unavailable,
		});
	});

	it("RPC-EVENT-008 RPC-EVENT-009 RPC-EVENT-010 RPC-EVENT-011 RPC-EVENT-012 RPC-EVENT-017 publishes one payload-free outgoing pair", async () => {
		const trace: string[] = [];
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(sink) {
						return {
							start() {
								sink
									.reserveItem({ value: "private-item", weight: 14 } as never)
									.commit();
								sink.reserveTerminal({ type: "completed" }).commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.outgoing-telemetry.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.streamStarted) {
				trace.push("stream-started");
			}
			if (event.type === RpcEventTypeEnum.streamFinished) {
				trace.push("stream-finished");
			}
		});

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({ complete: () => trace.push("observer-complete") });

		const streamEvents = events.filter(
			(event) =>
				event.type === RpcEventTypeEnum.streamStarted ||
				event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(trace).toEqual([
			"stream-started",
			"stream-finished",
			"observer-complete",
		]);
		expect(streamEvents).toHaveLength(2);
		expect(streamEvents[0]).toMatchObject({
			type: RpcEventTypeEnum.streamStarted,
			direction: RpcEventDirectionEnum.outgoing,
			service: "example.outgoing-telemetry.v1",
			member: "history",
		});
		expect(streamEvents[1]).toMatchObject({
			type: RpcEventTypeEnum.streamFinished,
			observationId: Reflect.get(streamEvents[0] as object, "observationId"),
			direction: RpcEventDirectionEnum.outgoing,
			service: "example.outgoing-telemetry.v1",
			member: "history",
			outcome: RpcStreamStatusEnum.completed,
			deliveredItemCount: 1,
			durationMs: expect.any(Number),
		});
		expect(JSON.stringify(streamEvents)).not.toContain("private-item");
		await connector.close();
	});

	it("RPC-EVENT-008 RPC-EVENT-009 emits no pair before Local Stream Subscription Admission", async () => {
		let reservations = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				reservations += 1;
				return undefined;
			},
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.pre-admission-telemetry.v1",
			members: { history: { kind: "stream-method" } },
		});
		const remote = connector.peer.resolve(descriptor);

		remote.history(Symbol("invalid") as never).subscribe({ error() {} });
		remote.history("capacity-rejected").subscribe({ error() {} });

		expect(reservations).toBe(1);
		expect(
			events.filter(
				(event) =>
					event.type === RpcEventTypeEnum.streamStarted ||
					event.type === RpcEventTypeEnum.streamFinished,
			),
		).toEqual([]);
		await connector.close();
	});

	it("RPC-EVENT-009 emits one canceled outgoing finish and suppresses a late terminal", async () => {
		let sink: IRpcProtocolSubscriberSink | undefined;
		let cancels = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {},
							cancel() {
								cancels += 1;
							},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.canceled-telemetry.v1",
			members: { events$: { kind: "stream-property" } },
		});
		const subscription = connector.peer.resolve(descriptor).events$.subscribe();

		subscription.unsubscribe();
		subscription.unsubscribe();
		sink?.reserveTerminal({ type: "completed" }).commit();

		const finished = events.filter(
			(event) => event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(cancels).toBe(1);
		expect(finished).toHaveLength(1);
		expect(finished[0]).toMatchObject({
			direction: RpcEventDirectionEnum.outgoing,
			outcome: RpcStreamStatusEnum.canceled,
			deliveredItemCount: 0,
		});
		await connector.close();
	});

	it("RPC-EVENT-009 RPC-EVENT-013 RPC-LIFE-003 preserves stream FIFO under reentrant force", async () => {
		let sink: IRpcProtocolSubscriberSink | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(nextSink) {
						sink = nextSink;
						return { start() {}, cancel() {} };
					},
					release() {},
				};
			},
			forceClose() {
				sink
					?.reserveTerminal({
						type: "failed",
						code: RpcExceptionCodeEnum.outcomeUnknown,
					})
					.commit();
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.reentrant-stream-event.v1",
			members: { events$: { kind: "stream-property" } },
		});
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.streamStarted) {
				sink
					?.reserveTerminal({
						type: "failed",
						code: RpcExceptionCodeEnum.outcomeUnknown,
					})
					.commit();
				void connector.close();
			}
		});
		const trace: string[] = [];
		connector.event$.subscribe((event) => trace.push(event.type));

		connector.peer.resolve(descriptor).events$.subscribe({ error() {} });
		await connector.close();

		expect(trace).toEqual([
			RpcEventTypeEnum.streamStarted,
			RpcEventTypeEnum.streamFinished,
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
			RpcEventTypeEnum.topologyClosed,
		]);
	});

	it("RPC-STREAM-010 RPC-RECOVERY-004 preserves one admitted outgoing stream through Recovery", async () => {
		let committedSink: IRpcProtocolSubscriberSink | undefined;
		let retainedItem:
			| ReturnType<IRpcProtocolSubscriberSink["reserveItem"]>
			| undefined;
		let reservationCalls = 0;
		let starts = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				reservationCalls += 1;
				return {
					commit(sink) {
						committedSink = sink;
						return {
							start() {
								starts += 1;
								retainedItem = sink.reserveItem({
									value: "retained",
									weight: 10,
								} as never);
								retainedItem.commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.recovery-continuity.v1",
			members: { history: { kind: "stream-method" } },
		});
		const facade = connector.peer.resolve(descriptor);
		const history = facade.history;
		const history$ = facade.history("room");
		const values: string[] = [];

		history$.subscribe((value) => values.push(value));
		const originalSink = committedSink;
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		retainedItem?.commit();

		expect(facade.history).toBe(history);
		expect(committedSink).toBe(originalSink);
		expect({ reservationCalls, starts }).toEqual({
			reservationCalls: 1,
			starts: 1,
		});
		expect(values).toEqual(["retained"]);
		expect(connector.peer.state).toEqual({ status: "connected" });
		await connector.close();
	});

	it("RPC-STREAM-010 RPC-RECOVERY-008 RPC-SEC-011 RPC-RESOURCE-015 RPC-CONFORMANCE-004 publishes Recovery without Source resubscription", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost, events } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.recovery-source.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		let methodCalls = 0;
		let sourceSubscriptions = 0;
		let sourceTeardowns = 0;
		connector.peer.expose(descriptor, {
			history() {
				methodCalls += 1;
				return new Observable<string>((subscriber) => {
					sourceSubscriptions += 1;
					const subscription = source.subscribe(subscriber);
					return () => {
						sourceTeardowns += 1;
						subscription.unsubscribe();
					};
				});
			},
		} as never);
		const values: string[] = [];
		const history$ = connector.peer.resolve(descriptor).history("room");
		history$.subscribe((value) => values.push(value));
		await Promise.resolve();
		await Promise.resolve();

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(
			events.filter((event) => event.type === RpcEventTypeEnum.streamStarted),
		).toHaveLength(2);
		expect(
			events.filter((event) => event.type === RpcEventTypeEnum.streamFinished),
		).toHaveLength(0);
		source.next("after-recovery");
		flow.flush();
		source.complete();
		flow.flush();

		expect(values).toEqual(["after-recovery"]);
		expect({ methodCalls, sourceSubscriptions, sourceTeardowns }).toEqual({
			methodCalls: 1,
			sourceSubscriptions: 1,
			sourceTeardowns: 1,
		});
		expect(flow.released).toBe(true);
		const finished = events.filter(
			(event) => event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(finished).toHaveLength(2);
		expect(finished).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					direction: RpcEventDirectionEnum.incoming,
					outcome: RpcStreamStatusEnum.completed,
					admittedItemCount: 1,
				}),
				expect.objectContaining({
					direction: RpcEventDirectionEnum.outgoing,
					outcome: RpcStreamStatusEnum.completed,
					deliveredItemCount: 1,
				}),
			]),
		);
		await connector.close();
	});

	it("RPC-RECOVERY-009 fences a recovered state publication superseded by graceful cutoff", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		const earlierStates: string[] = [];
		const laterStates: string[] = [];
		let recoveryStarted = false;
		let terminationTask: Promise<void> | undefined;
		connector.peer.state$.subscribe((state) => {
			earlierStates.push(state.status);
			if (state.status === RpcStateStatusEnum.recovering) {
				recoveryStarted = true;
			} else if (
				recoveryStarted &&
				state.status === RpcStateStatusEnum.connected
			) {
				terminationTask = connector.shutdown();
			}
		});
		connector.peer.state$.subscribe((state) => laterStates.push(state.status));
		earlierStates.length = 0;
		laterStates.length = 0;

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});

		expect(earlierStates).toEqual(["recovering", "connected", "draining"]);
		expect(laterStates).toEqual(["recovering", "draining"]);
		expect(connector.peer.state).toEqual({
			status: RpcStateStatusEnum.draining,
			reason: RpcCloseReasonEnum.gracefulShutdown,
		});
		await terminationTask;
		let lateStateCount = 0;
		let lateCompletionCount = 0;
		connector.peer.state$.subscribe({
			next: () => {
				lateStateCount += 1;
			},
			complete: () => {
				lateCompletionCount += 1;
			},
		});
		expect({ lateCompletionCount, lateStateCount }).toEqual({
			lateCompletionCount: 1,
			lateStateCount: 0,
		});
	});

	it("RPC-RECOVERY-009 RPC-EVENT-014 RPC-LIFE-003 suppresses a recovered event revoked by reentrant close", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		const laterEvents: string[] = [];
		let terminationTask: Promise<void> | undefined;
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.peerRecovered) {
				terminationTask = connector.close();
			}
		});
		connector.event$.subscribe((event) => laterEvents.push(event.type));

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		laterEvents.length = 0;
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});

		expect(laterEvents).not.toContain(RpcEventTypeEnum.peerRecovered);
		expect(laterEvents.slice(0, 2)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		await terminationTask;
	});

	it("RPC-EVENT-014 RPC-LIFE-003 suppresses an owner-draining event revoked by reentrant close through the same task", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const laterEvents: string[] = [];
		let closeTask: Promise<void> | undefined;
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.ownerDraining) {
				closeTask = connector.close();
			}
		});
		connector.event$.subscribe((event) => laterEvents.push(event.type));

		const shutdownTask = connector.shutdown();

		expect(closeTask).toBe(shutdownTask);
		expect(laterEvents).not.toContain(RpcEventTypeEnum.ownerDraining);
		expect(laterEvents.slice(0, 2)).toEqual([
			RpcEventTypeEnum.peerClosed,
			RpcEventTypeEnum.ownerClosing,
		]);
		await shutdownTask;
	});

	it("RPC-STREAM-010 RPC-RECOVERY-007 hands an identity-free Pending stream off once after Recovery", async () => {
		let incomingHost: IRpcProtocolSessionHost | undefined;
		let recovering = false;
		let admissionHandoffs = 0;
		const pendingAdmissions = new Set<() => void>();
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream(request) {
				return {
					commit(subscriberSink) {
						let admitted = false;
						let canceled = false;
						const admit = (): void => {
							if (admitted || canceled) {
								return;
							}
							admitted = true;
							pendingAdmissions.delete(admit);
							admissionHandoffs += 1;
							const reservation = incomingHost?.reserveIncomingStream(request);
							if (reservation?.kind !== "source") {
								subscriberSink
									.reserveTerminal({
										type: "failed",
										code: RpcExceptionCodeEnum.unavailable,
									})
									.commit();
								return;
							}
							let incomingStream: IRpcProtocolIncomingStream | undefined;
							const sourceSink: IRpcProtocolSourceSink = {
								reserveEmission: () => undefined,
								finish: (outcome) => {
									if (outcome.type === "completed") {
										subscriberSink.reserveTerminal(outcome).commit();
										incomingStream?.finish(outcome, () => {});
										return;
									}
									const failure: Extract<
										RpcIncomingStreamTerminal,
										{ readonly type: "failed" }
									> = {
										type: "failed",
										code: RpcExceptionCodeEnum.handlerFailed,
									};
									subscriberSink.reserveTerminal(failure).commit();
									incomingStream?.finish(failure, () => {});
								},
							};
							incomingStream = reservation.reservation.commit(sourceSink);
						};
						return {
							start() {
								if (recovering) {
									pendingAdmissions.add(admit);
								} else {
									admit();
								}
							},
							cancel() {
								if (!admitted) {
									canceled = true;
									pendingAdmissions.delete(admit);
								}
							},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		incomingHost = sessionHost;
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.pending-recovery.v1",
			members: { history: { kind: "stream-method" } },
		});
		let methodCalls = 0;
		connector.peer.expose(descriptor, {
			history: () => {
				methodCalls += 1;
				return of("done");
			},
		} as never);
		recovering = true;
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		const history$ = connector.peer.resolve(descriptor).history("room");
		const retracted = history$.subscribe();
		history$.subscribe();
		expect(pendingAdmissions.size).toBe(2);
		retracted.unsubscribe();

		recovering = false;
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		for (const admit of [...pendingAdmissions]) {
			admit();
			admit();
		}
		await Promise.resolve();
		await Promise.resolve();

		expect({ admissionHandoffs, methodCalls }).toEqual({
			admissionHandoffs: 1,
			methodCalls: 1,
		});
		expect(pendingAdmissions.size).toBe(0);
		await connector.close();
	});

	it("RPC-STREAM-002 RPC-STREAM-003 RPC-STREAM-008 sends one cancel only for explicit unsubscription", async () => {
		let starts = 0;
		let cancels = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit() {
						return {
							start() {
								starts += 1;
							},
							cancel() {
								cancels += 1;
							},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.cancel-stream.v1",
			members: { history: { kind: "stream-method" } },
		});
		const subscription = connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe();

		expect(starts).toBe(1);
		expect(cancels).toBe(0);
		subscription.unsubscribe();
		subscription.unsubscribe();
		expect(cancels).toBe(1);
		await connector.close();
	});

	it("RPC-DESC-008 RPC-SPI-013 subscribes a stream property without arguments", async () => {
		const requests: unknown[] = [];
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream(request) {
				requests.push(request);
				return {
					commit(sink) {
						return {
							start() {
								sink.reserveTerminal({ type: "completed" }).commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.property-stream.v1",
			members: { events$: { kind: "stream-property" } },
		});
		let completed = 0;

		connector.peer.resolve(descriptor).events$.subscribe({
			complete: () => {
				completed += 1;
			},
		});

		expect(requests).toEqual([
			{
				service: "example.property-stream.v1",
				member: "events$",
				kind: "stream-property",
			},
		]);
		expect(completed).toBe(1);
		await connector.close();
	});

	it("RPC-FLOW-001 RPC-FLOW-002 RPC-FLOW-004 RPC-FLOW-006 RPC-WIRE-019 RPC-EVENT-016 overflows a real RxJS burst at W=1", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost, events } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-burst.v1",
			members: { history: { kind: "stream-method" } },
		});
		let poisonReads = 0;
		const overflowValue = Object.defineProperty({}, "poison", {
			enumerable: true,
			get() {
				poisonReads += 1;
				return "must not be inspected";
			},
		});
		let sourceTeardowns = 0;
		connector.peer.expose(descriptor, {
			history: () =>
				new Observable<string>((subscriber) => {
					subscriber.next("admitted");
					subscriber.next(overflowValue as never);
					return () => {
						sourceTeardowns += 1;
					};
				}),
		} as never);
		const values: string[] = [];
		const errors: unknown[] = [];

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				next: (value) => values.push(value),
				error: (error) => errors.push(error),
			});
		await Promise.resolve();
		await Promise.resolve();
		flow.flush();

		expect(values).toEqual(["admitted"]);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(RpcException);
		expect(errors[0]).toMatchObject({
			code: RpcExceptionCodeEnum.overflow,
			cause: undefined,
		});
		expect(flow.terminal).toEqual({
			type: "failed",
			code: RpcExceptionCodeEnum.overflow,
		});
		expect(flow.admittedItemCount).toBe(1);
		expect(flow.creditThrough).toBe(1);
		expect(poisonReads).toBe(0);
		expect(sourceTeardowns).toBe(1);
		expect(flow.released).toBe(true);
		const finished = events.filter(
			(event) => event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(finished).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					direction: RpcEventDirectionEnum.incoming,
					outcome: RpcStreamStatusEnum.failed,
					code: RpcExceptionCodeEnum.overflow,
					admittedItemCount: 1,
				}),
				expect.objectContaining({
					direction: RpcEventDirectionEnum.outgoing,
					outcome: RpcStreamStatusEnum.failed,
					code: RpcExceptionCodeEnum.overflow,
					deliveredItemCount: 1,
				}),
			]),
		);
		await connector.close();
	});

	it("RPC-FLOW-004 RPC-EVENT-016 selects overflow before inspecting an emission without ordinary capacity", async () => {
		const flow = createW1SemanticStreamHarness();
		flow.setOrdinaryCapacityAvailable(false);
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-capacity.v1",
			members: { history: { kind: "stream-method" } },
		});
		let poisonReads = 0;
		const unavailableValue = Object.defineProperty({}, "poison", {
			enumerable: true,
			get() {
				poisonReads += 1;
				return "must not be inspected";
			},
		});
		connector.peer.expose(descriptor, {
			history: () => of(unavailableValue),
		} as never);
		const errors: unknown[] = [];

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				error: (error) => errors.push(error),
			});
		await Promise.resolve();
		await Promise.resolve();
		flow.flush();

		expect(errors[0]).toMatchObject({
			code: RpcExceptionCodeEnum.overflow,
			cause: undefined,
		});
		expect(flow.admittedItemCount).toBe(0);
		expect(poisonReads).toBe(0);
		await connector.close();
	});

	it("RPC-FLOW-005 classifies an invalid admitted emission as handler-failed", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-invalid.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history: () => of(Symbol("invalid item")),
		} as never);
		const errors: unknown[] = [];

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				error: (error) => errors.push(error),
			});
		await Promise.resolve();
		await Promise.resolve();
		flow.flush();

		expect(errors[0]).toMatchObject({
			code: RpcExceptionCodeEnum.handlerFailed,
			cause: undefined,
		});
		expect(flow.terminal).toEqual({
			type: "failed",
			code: RpcExceptionCodeEnum.handlerFailed,
		});
		expect(flow.admittedItemCount).toBe(0);
		await connector.close();
	});

	it("RPC-FLOW-003 RPC-WIRE-019 re-arms one cumulative credit after each serial next return", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-rearm.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		connector.peer.expose(descriptor, { history: () => source } as never);
		const values: string[] = [];
		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe((value) => values.push(value));
		await Promise.resolve();
		await Promise.resolve();

		source.next("first");
		flow.flush();
		expect(flow.creditThrough).toBe(2);
		source.next("second");
		flow.flush();

		expect(values).toEqual(["first", "second"]);
		expect(flow.admittedItemCount).toBe(2);
		expect(flow.creditThrough).toBe(3);
		await connector.close();
	});

	it("RPC-FLOW-003 RPC-FLOW-004 keeps reentrant delivery serial and exhausts credit inside next", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-reentrant.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		connector.peer.expose(descriptor, { history: () => source } as never);
		const trace: string[] = [];
		let callbackDepth = 0;
		let maximumCallbackDepth = 0;
		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				next(value) {
					callbackDepth += 1;
					maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
					trace.push(`next:${value}:begin`);
					source.next("overflow");
					trace.push(`next:${value}:end`);
					callbackDepth -= 1;
				},
				error(error) {
					callbackDepth += 1;
					maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
					trace.push(`error:${String((error as RpcException).code)}`);
					callbackDepth -= 1;
				},
			});
		await Promise.resolve();
		await Promise.resolve();

		source.next("first");
		flow.flush();

		expect(trace).toEqual([
			"next:first:begin",
			"next:first:end",
			"error:overflow",
		]);
		expect(maximumCallbackDepth).toBe(1);
		expect(flow.admittedItemCount).toBe(1);
		expect(flow.creditThrough).toBe(1);
		await connector.close();
	});

	it("RPC-FLOW-003 RPC-WIRE-019 faults an overlapping custom Protocol item projection before Observer reentry", async () => {
		let forceCloses = 0;
		let firstEffect: "closed" | "rearm" | undefined;
		let sink: IRpcProtocolSubscriberSink | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {
								firstEffect = nextSink
									.reserveItem({ value: "first", weight: 5 } as never)
									.commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {
				forceCloses += 1;
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.overlapping-item.v1",
			members: { history: { kind: "stream-method" } },
		});
		const values: string[] = [];
		let callbackDepth = 0;
		let maximumCallbackDepth = 0;

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe((value) => {
				callbackDepth += 1;
				maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
				values.push(value);
				if (value === "first") {
					sink
						?.reserveItem({ value: "over-credit", weight: 11 } as never)
						.commit();
				}
				callbackDepth -= 1;
			});

		expect(values).toEqual(["first"]);
		expect(maximumCallbackDepth).toBe(1);
		expect(firstEffect).toBe("closed");
		expect(forceCloses).toBe(1);
		await connector.close();
	});

	it("RPC-FLOW-003 does not re-arm credit after unsubscribe inside next", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.w1-unsubscribe.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		connector.peer.expose(descriptor, { history: () => source } as never);
		const values: string[] = [];
		const observer = new Subscriber<string>({
			next(value) {
				values.push(value);
				observer.unsubscribe();
			},
			error() {},
			complete() {},
		});
		connector.peer.resolve(descriptor).history("room").subscribe(observer);
		await Promise.resolve();
		await Promise.resolve();

		source.next("first");
		flow.flush();

		expect(values).toEqual(["first"]);
		expect(flow.creditThrough).toBe(1);
		expect(flow.terminal).toEqual({ type: "canceled" });
		await connector.close();
	});

	it("RPC-STREAM-006 RPC-STREAM-009 serializes a reentrant terminal after next", async () => {
		const trace: string[] = [];
		let callbackDepth = 0;
		let maximumCallbackDepth = 0;
		let subscriberSink: IRpcProtocolSubscriberSink | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(sink) {
						subscriberSink = sink;
						return {
							start() {
								const item = sink.reserveItem({
									value: "first",
									weight: 5,
								} as never);
								trace.push(`item:${item.commit()}`);
								trace.push(
									`late:${sink
										.reserveItem({ value: "late", weight: 4 } as never)
										.commit()}`,
								);
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.reentrant-stream.v1",
			members: { history: { kind: "stream-method" } },
		});

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				next(value) {
					callbackDepth += 1;
					maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
					trace.push(`next:${value}:begin`);
					subscriberSink?.reserveTerminal({ type: "completed" }).commit();
					trace.push(`next:${value}:end`);
					callbackDepth -= 1;
				},
				complete() {
					callbackDepth += 1;
					maximumCallbackDepth = Math.max(maximumCallbackDepth, callbackDepth);
					trace.push("complete");
					callbackDepth -= 1;
				},
			});

		expect(maximumCallbackDepth).toBe(1);
		expect(trace).toEqual([
			"next:first:begin",
			"next:first:end",
			"complete",
			"item:closed",
			"late:closed",
		]);
		await connector.close();
	});

	it("RPC-STREAM-007 RPC-FLOW-003 keeps a committed item and re-arms when its Observer throws", async () => {
		const reported: unknown[] = [];
		const previousUnhandledError = config.onUnhandledError;
		config.onUnhandledError = (error) => reported.push(error);
		let forceCloses = 0;
		let itemEffect = "";
		let completed = 0;
		const observerFailure = new Error("local observer failure");
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(sink) {
						return {
							start() {
								itemEffect = sink
									.reserveItem({ value: "item", weight: 4 } as never)
									.commit();
								sink.reserveTerminal({ type: "completed" }).commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {
				forceCloses += 1;
			},
		};
		try {
			const { connector } = await connectProtocolSession(session);
			const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
				wireName: "example.observer-throw.v1",
				members: { history: { kind: "stream-method" } },
			});

			connector.peer
				.resolve(descriptor)
				.history("room")
				.subscribe({
					next() {
						throw observerFailure;
					},
					complete() {
						completed += 1;
					},
				});
			await vi.waitFor(() => expect(reported).toContain(observerFailure));

			expect(itemEffect).toBe("rearm");
			expect(completed).toBe(1);
			expect(forceCloses).toBe(0);
			expect(reported).toEqual([observerFailure]);
			await connector.close();
		} finally {
			config.onUnhandledError = previousUnhandledError;
		}
	});

	it("RPC-STREAM-008 fences late effects after unsubscribe inside next", async () => {
		const values: string[] = [];
		let cancels = 0;
		let itemEffect = "";
		let sink: IRpcProtocolSubscriberSink | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(nextSink) {
						sink = nextSink;
						return {
							start() {
								itemEffect = nextSink
									.reserveItem({ value: "first", weight: 5 } as never)
									.commit();
							},
							cancel() {
								cancels += 1;
							},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.unsubscribe-next.v1",
			members: { history: { kind: "stream-method" } },
		});
		const observer = new Subscriber<string>({
			next(value) {
				values.push(value);
				observer.unsubscribe();
			},
			error() {},
			complete() {},
		});

		connector.peer.resolve(descriptor).history("room").subscribe(observer);
		sink?.reserveItem({ value: "late", weight: 4 } as never).commit();
		sink?.reserveTerminal({ type: "completed" }).commit();

		expect(values).toEqual(["first"]);
		expect(itemEffect).toBe("closed");
		expect(cancels).toBe(1);
		await connector.close();
	});

	it("RPC-STREAM-005 RPC-STREAM-012 RPC-STREAM-013 RPC-STREAM-014 runs one synchronous Source lifecycle", async () => {
		const trace: string[] = [];
		let sourceSubscriptions = 0;
		let sourceTeardowns = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.source-lifecycle.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history(room: string) {
				trace.push(`acquire:${room}`);
				return new Observable<string>((subscriber) => {
					sourceSubscriptions += 1;
					trace.push("source:subscribe");
					subscriber.next("first");
					subscriber.complete();
					return () => {
						sourceTeardowns += 1;
						trace.push("source:teardown");
					};
				});
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.source-lifecycle.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.streamStarted) {
				trace.push("event:stream-started");
			}
		});
		expect(reservation?.kind).toBe("source");
		let incoming: IRpcProtocolIncomingStream | undefined;
		const sourceSink: IRpcProtocolSourceSink = {
			reserveEmission() {
				trace.push("protocol:reserve-emission");
				return {
					commit(snapshot) {
						trace.push(`protocol:item:${snapshot.value}`);
					},
					fail() {
						trace.push("protocol:item-failed");
					},
				};
			},
			finish(outcome) {
				trace.push(`protocol:terminal:${outcome.type}`);
				incoming?.finish(outcome, () => trace.push("protocol:on-released"));
			},
		};
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit(sourceSink);
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(sourceSubscriptions).toBe(1);
		expect(sourceTeardowns).toBe(1);
		expect(trace).toEqual([
			"event:stream-started",
			"acquire:room",
			"source:subscribe",
			"protocol:reserve-emission",
			"protocol:item:first",
			"protocol:terminal:completed",
			"source:teardown",
			"protocol:on-released",
		]);
		const streamEvents = events.filter(
			(event) =>
				event.type === RpcEventTypeEnum.streamStarted ||
				event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(streamEvents).toHaveLength(2);
		expect(streamEvents[0]).toMatchObject({
			type: RpcEventTypeEnum.streamStarted,
			direction: RpcEventDirectionEnum.incoming,
			service: "example.source-lifecycle.v1",
			member: "history",
		});
		expect(streamEvents[1]).toMatchObject({
			type: RpcEventTypeEnum.streamFinished,
			observationId: Reflect.get(streamEvents[0] as object, "observationId"),
			direction: RpcEventDirectionEnum.incoming,
			service: "example.source-lifecycle.v1",
			member: "history",
			outcome: RpcStreamStatusEnum.completed,
			admittedItemCount: 1,
			durationMs: expect.any(Number),
		});
		await connector.close();
	});

	it("RPC-STREAM-012 tears down the returned Source Subscription handle once", async () => {
		let returnedTeardowns = 0;
		let releases = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.returned-source-subscription.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				return {
					lift() {},
					subscribe(subscriber: Subscriber<unknown>) {
						subscriber.complete();
						return {
							closed: false,
							unsubscribe() {
								returnedTeardowns += 1;
							},
						};
					},
				};
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.returned-source-subscription.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => undefined,
				finish(outcome) {
					incoming?.finish(outcome, () => {
						releases += 1;
					});
				},
			});
		}
		await Promise.resolve();
		await Promise.resolve();
		incoming?.finish({ type: "canceled" }, () => {
			releases += 100;
		});

		expect(returnedTeardowns).toBe(1);
		expect(releases).toBe(1);
		await connector.close();
	});

	it("RPC-RESOURCE-012 RPC-STREAM-004 RPC-VALID-010 reserves capacity before route classification", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session, {
			maxApplicationWorkPerSession: 2,
			maxActiveStreamsPerSession: 2,
		});
		const heldReservations: Array<{ release(): void }> = [];
		const missingRoute = {
			service: "example.capacity-before-route.v1",
			member: "missing$",
			kind: "stream-property" as const,
		};
		for (let index = 0; index < 2; index += 1) {
			const held = sessionHost.reserveIncomingStream(missingRoute);
			expect(held?.kind).toBe("unknown");
			if (held !== undefined) {
				heldReservations.push(held.reservation);
			}
		}

		expect(sessionHost.reserveIncomingStream(missingRoute)).toBeUndefined();
		for (const heldReservation of heldReservations) {
			heldReservation.release();
		}
		const reopened = sessionHost.reserveIncomingStream(missingRoute);
		expect(reopened?.kind).toBe("unknown");
		reopened?.reservation.release();
		await connector.close();
	});

	it("RPC-RESOURCE-007 RPC-RESOURCE-009 shares Application Work between outgoing unary and stream roots", async () => {
		let subscriberSink: IRpcProtocolSubscriberSink | undefined;
		let invocationReservations = 0;
		let streamReservations = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				invocationReservations += 1;
				return {
					commit: (sink) => ({
						start: () =>
							sink.finish({ type: RpcCallTerminalTypeEnum.returnedVoid }),
						cancel() {},
					}),
					release() {},
				};
			},
			reserveStream() {
				streamReservations += 1;
				return {
					commit(sink) {
						subscriberSink = sink;
						return { start() {}, cancel() {} };
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session, {
			maxApplicationWorkPerSession: 1,
			maxActiveStreamsPerSession: 1,
		});
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.shared-application-work.v1",
			members: {
				add: { kind: "unary" },
				history: { kind: "stream-method" },
			},
		});
		const remote = connector.peer.resolve(descriptor);
		const first = remote.history("room").subscribe();
		const rejectedStreamErrors: unknown[] = [];
		remote.history("other").subscribe({
			error: (error) => rejectedStreamErrors.push(error),
		});

		await expect(remote.add(1, 2)).rejects.toMatchObject({
			code: RpcExceptionCodeEnum.unavailable,
		});
		expect(rejectedStreamErrors).toMatchObject([
			{ code: RpcExceptionCodeEnum.unavailable },
		]);
		expect(streamReservations).toBe(1);
		expect(invocationReservations).toBe(0);

		subscriberSink?.reserveTerminal({ type: "completed" }).commit();
		await expect(remote.add(1, 2)).resolves.toBeUndefined();
		expect(invocationReservations).toBe(1);
		first.unsubscribe();
		await connector.close();
	});

	it("RPC-RESOURCE-007 RPC-RESOURCE-009 applies Active Streams as a subset without blocking unary work", async () => {
		const streamSinks: IRpcProtocolSubscriberSink[] = [];
		const session: IRpcProtocolSession = {
			reserveInvocation: () => ({
				commit: (sink) => ({
					start: () =>
						sink.finish({ type: RpcCallTerminalTypeEnum.returnedVoid }),
					cancel() {},
				}),
				release() {},
			}),
			reserveStream: () => ({
				commit: (sink) => {
					streamSinks.push(sink);
					return { start() {}, cancel() {} };
				},
				release() {},
			}),
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session, {
			maxApplicationWorkPerSession: 2,
			maxActiveStreamsPerSession: 1,
		});
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.active-stream-subset.v1",
			members: {
				add: { kind: "unary" },
				history: { kind: "stream-method" },
			},
		});
		const remote = connector.peer.resolve(descriptor);
		const first = remote.history("room").subscribe();
		const rejectedStreamErrors: unknown[] = [];
		remote.history("other").subscribe({
			error: (error) => rejectedStreamErrors.push(error),
		});

		await expect(remote.add(1, 2)).resolves.toBeUndefined();
		expect(rejectedStreamErrors).toMatchObject([
			{ code: RpcExceptionCodeEnum.unavailable },
		]);

		streamSinks[0]?.reserveTerminal({ type: "completed" }).commit();
		first.unsubscribe();
		await connector.close();
	});

	it("RPC-RESOURCE-007 RPC-RESOURCE-012 shares incoming Application Work while keeping Active Streams a subset", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } = await connectProtocolSession(
			session,
			{
				maxApplicationWorkPerSession: 2,
				maxActiveStreamsPerSession: 1,
			},
		);
		const args = host.normalizeApplicationArguments([]);
		const stream = sessionHost.reserveIncomingStream({
			service: "missing.service",
			member: "missing$",
			kind: "stream-property",
		});
		const call = sessionHost.reserveIncomingCall({
			service: "missing.service",
			method: "missing",
			args,
		});

		expect(stream?.kind).toBe("unknown");
		expect(call?.kind).toBe("unknown");
		expect(
			sessionHost.reserveIncomingStream({
				service: "missing.service",
				member: "other$",
				kind: "stream-property",
			}),
		).toBeUndefined();
		stream?.reservation.release();
		call?.reservation.release();
		await connector.close();
	});

	it("RPC-STREAM-003 RPC-STREAM-014 keeps Source ownership through onReleased", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } = await connectProtocolSession(
			session,
			{
				maxApplicationWorkPerSession: 256,
				maxActiveStreamsPerSession: 256,
			},
		);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.source-release-receipt.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history: () => new Observable(() => undefined),
		} as never);
		const source = sessionHost.reserveIncomingStream({
			service: "example.source-release-receipt.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (source?.kind === "source") {
			incoming = source.reservation.commit({
				reserveEmission: () => undefined,
				finish() {},
			});
		}
		await Promise.resolve();
		await Promise.resolve();
		const heldReservations: Array<{ release(): void }> = [];
		const missingRoute = {
			service: "example.source-release-capacity.v1",
			member: "missing$",
			kind: "stream-property" as const,
		};
		for (let index = 0; index < 255; index += 1) {
			const held = sessionHost.reserveIncomingStream(missingRoute);
			expect(held?.kind).toBe("unknown");
			if (held !== undefined) {
				heldReservations.push(held.reservation);
			}
		}
		let capacityHeldThroughReceipt = false;
		incoming?.finish({ type: "canceled" }, () => {
			capacityHeldThroughReceipt =
				sessionHost.reserveIncomingStream(missingRoute) === undefined;
		});

		expect(capacityHeldThroughReceipt).toBe(true);
		const reopened = sessionHost.reserveIncomingStream(missingRoute);
		expect(reopened?.kind).toBe("unknown");
		reopened?.reservation.release();
		for (const heldReservation of heldReservations) {
			heldReservation.release();
		}
		await connector.close();
	});

	it("RPC-DESC-008 keeps the captured stream-property route after cleanup and re-exposure", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.captured-property.v1",
			members: { lazy$: { kind: "stream-property" } },
		});
		let oldGetterCalls = 0;
		let newGetterCalls = 0;
		const oldImplementation = Object.create(null);
		Object.defineProperty(oldImplementation, "lazy$", {
			get() {
				oldGetterCalls += 1;
				return of("old");
			},
		});
		const newImplementation = Object.create(null);
		Object.defineProperty(newImplementation, "lazy$", {
			get() {
				newGetterCalls += 1;
				return of("new");
			},
		});
		const cleanup = connector.peer.expose(descriptor, oldImplementation);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.captured-property.v1",
			member: "lazy$",
			kind: "stream-property",
		});
		expect(oldGetterCalls).toBe(0);
		cleanup();
		connector.peer.expose(descriptor, newImplementation);
		const items: unknown[] = [];
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => ({
					commit: (snapshot) => items.push(snapshot.value),
					fail() {},
				}),
				finish(outcome) {
					incoming?.finish(outcome, () => undefined);
				},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(oldGetterCalls).toBe(1);
		expect(newGetterCalls).toBe(0);
		expect(items).toEqual(["old"]);
		await connector.close();
	});

	it("RPC-STREAM-005 removes a queued Source Start Job after a terminal winner", async () => {
		let acquisitions = 0;
		let subscriptions = 0;
		let releases = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.queued-source.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				acquisitions += 1;
				return new Observable(() => {
					subscriptions += 1;
				});
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.queued-source.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => undefined,
				finish() {},
			});
		}
		incoming?.finish({ type: "canceled" }, () => {
			releases += 1;
		});
		incoming?.finish({ type: "canceled" }, () => {
			releases += 100;
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(acquisitions).toBe(0);
		expect(subscriptions).toBe(0);
		expect(releases).toBe(1);
		await connector.close();
	});

	it("RPC-STREAM-009 RPC-STREAM-012 RPC-STREAM-013 fences and tears down an active Source once", async () => {
		const applicationSource = new Subject<string>();
		let sourceTeardowns = 0;
		let releases = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.active-source.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				return new Observable<string>((subscriber) => {
					const subscription = applicationSource.subscribe(subscriber);
					return () => {
						sourceTeardowns += 1;
						subscription.unsubscribe();
					};
				});
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.active-source.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		const items: unknown[] = [];
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => ({
					commit: (snapshot) => items.push(snapshot.value),
					fail() {},
				}),
				finish() {},
			});
		}
		await Promise.resolve();
		await Promise.resolve();
		applicationSource.next("first");
		incoming?.finish({ type: "canceled" }, () => {
			releases += 1;
		});
		incoming?.finish({ type: "session-terminated" }, () => {
			releases += 100;
		});
		applicationSource.next("late");

		expect(items).toEqual(["first"]);
		expect(sourceTeardowns).toBe(1);
		expect(releases).toBe(1);
		await connector.close();
	});

	it.each([
		[
			"acquisition throw",
			() => {
				throw new Error("raw acquisition failure");
			},
		],
		["invalid Observable", () => ({})],
		[
			"subscribe throw",
			() => ({
				lift() {},
				subscribe() {
					throw new Error("raw subscribe failure");
				},
			}),
		],
		[
			"invalid returned subscription",
			() => ({
				lift() {},
				subscribe() {
					return {};
				},
			}),
		],
		[
			"source error",
			() =>
				new Observable((subscriber) => {
					subscriber.error(new Error("raw source failure"));
				}),
		],
		[
			"item normalization failure",
			() =>
				new Observable((subscriber) => {
					subscriber.next(Symbol("raw invalid item"));
				}),
		],
	] as const)("RPC-STREAM-007 RPC-VALID-010 maps %s to handler-failed", async (_label, createSource) => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.failed-source.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history: createSource,
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.failed-source.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		const terminals: unknown[] = [];
		let incoming: IRpcProtocolIncomingStream | undefined;
		const finishAsHandlerFailed = (): void => {
			const terminal = {
				type: "failed",
				code: RpcExceptionCodeEnum.handlerFailed,
			} as const;
			terminals.push(terminal);
			incoming?.finish(terminal, () => undefined);
		};
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => ({
					commit() {},
					fail: finishAsHandlerFailed,
				}),
				finish(outcome) {
					terminals.push(outcome);
					incoming?.finish(outcome, () => undefined);
				},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(terminals).toEqual([
			{
				type: "failed",
				code: RpcExceptionCodeEnum.handlerFailed,
			},
		]);
		expect(JSON.stringify(terminals)).not.toContain("raw");
		expect(
			events.filter((event) => event.type === RpcEventTypeEnum.streamFinished),
		).toEqual([
			expect.objectContaining({
				direction: RpcEventDirectionEnum.incoming,
				outcome: RpcStreamStatusEnum.failed,
				code: RpcExceptionCodeEnum.handlerFailed,
				admittedItemCount: 0,
			}),
		]);
		await connector.close();
	});

	it("RPC-STREAM-012 RPC-STREAM-013 keeps completion authoritative when teardown throws", async () => {
		const trace: string[] = [];
		let teardownAttempts = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.throwing-teardown.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				return new Observable((subscriber) => {
					subscriber.complete();
					return () => {
						teardownAttempts += 1;
						trace.push("source:teardown-throw");
						throw new Error("raw teardown failure");
					};
				});
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.throwing-teardown.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.streamFinished) {
				trace.push("event:stream-finished");
			}
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => undefined,
				finish(outcome) {
					trace.push(`protocol:terminal:${outcome.type}`);
					incoming?.finish(outcome, () => trace.push("protocol:on-released"));
				},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(teardownAttempts).toBe(1);
		expect(trace).toEqual([
			"protocol:terminal:completed",
			"source:teardown-throw",
			"protocol:on-released",
			"event:stream-finished",
		]);
		const finished = events.filter(
			(event) => event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(finished).toHaveLength(1);
		expect(finished[0]).toMatchObject({
			direction: RpcEventDirectionEnum.incoming,
			outcome: RpcStreamStatusEnum.completed,
			admittedItemCount: 0,
			sourceTeardownFailed: true,
		});
		await connector.close();
	});

	it("RPC-EVENT-018 does not classify a post-terminal subscribe throw as teardown failure", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.post-terminal-subscribe-throw.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				return {
					lift() {},
					subscribe(subscriber: Subscriber<unknown>) {
						subscriber.complete();
						throw new Error("post-terminal subscribe failure");
					},
				};
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.post-terminal-subscribe-throw.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => undefined,
				finish(outcome) {
					incoming?.finish(outcome, () => undefined);
				},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		const finished = events.find(
			(event) => event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(finished).toMatchObject({
			outcome: RpcStreamStatusEnum.completed,
			admittedItemCount: 0,
		});
		expect(finished).not.toHaveProperty("sourceTeardownFailed");
		await connector.close();
	});

	it("RPC-SPI-015 keeps a Protocol emission commit throw out of source failure classification", async () => {
		let forceCloses = 0;
		let emissionFailures = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {
				forceCloses += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.protocol-emission-failure.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history: () => of("item"),
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.protocol-emission-failure.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		if (reservation?.kind === "source") {
			reservation.reservation.commit({
				reserveEmission: () => ({
					commit() {
						throw new TypeError("Protocol commit failed.");
					},
					fail() {
						emissionFailures += 1;
					},
				}),
				finish() {},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(emissionFailures).toBe(0);
		expect(forceCloses).toBe(1);
	});

	it("RPC-VALID-010 classifies missing stream routes without application work", async () => {
		let acquisitions = 0;
		let releases = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.route-classification.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				acquisitions += 1;
				return of("unexpected");
			},
		} as never);
		const cases = [
			{
				request: {
					service: "example.missing-service.v1",
					member: "history",
					kind: "stream-property" as const,
				},
				code: RpcExceptionCodeEnum.unknownService,
			},
			{
				request: {
					service: "example.route-classification.v1",
					member: "missing$",
					kind: "stream-property" as const,
				},
				code: RpcExceptionCodeEnum.unknownMember,
			},
			{
				request: {
					service: "example.route-classification.v1",
					member: "history",
					kind: "stream-property" as const,
				},
				code: RpcExceptionCodeEnum.unknownMember,
			},
		] as const;

		for (const routeCase of cases) {
			const reservation = sessionHost.reserveIncomingStream(routeCase.request);
			expect(reservation).toMatchObject({
				kind: "unknown",
				code: routeCase.code,
			});
			if (reservation?.kind === "unknown") {
				const incoming = reservation.reservation.commit();
				incoming.finish({ type: "failed", code: routeCase.code }, () => {
					releases += 1;
				});
			}
		}

		expect(acquisitions).toBe(0);
		expect(releases).toBe(3);
		const streamEvents = events.filter(
			(event) =>
				event.type === RpcEventTypeEnum.streamStarted ||
				event.type === RpcEventTypeEnum.streamFinished,
		);
		expect(streamEvents).toHaveLength(6);
		expect(streamEvents[0]).not.toHaveProperty("service");
		expect(streamEvents[0]).not.toHaveProperty("member");
		expect(streamEvents[1]).toMatchObject({
			outcome: RpcStreamStatusEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
			admittedItemCount: 0,
		});
		expect(streamEvents[2]).toMatchObject({
			service: "example.route-classification.v1",
		});
		expect(streamEvents[2]).not.toHaveProperty("member");
		expect(streamEvents[3]).toMatchObject({
			service: "example.route-classification.v1",
			outcome: RpcStreamStatusEnum.failed,
			code: RpcExceptionCodeEnum.unknownMember,
			admittedItemCount: 0,
		});
		expect(JSON.stringify(streamEvents)).not.toContain("missing$");
		await connector.close();
	});

	it("RPC-VALID-010 projects a safe unknown-member stream error", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream() {
				return {
					commit(sink) {
						return {
							start() {
								sink
									.reserveTerminal({
										type: "failed",
										code: RpcExceptionCodeEnum.unknownMember,
									})
									.commit();
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.safe-route-error.v1",
			members: { history: { kind: "stream-method" } },
		});
		let receivedError: unknown;

		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				error: (error) => {
					receivedError = error;
				},
			});

		expect(receivedError).toBeInstanceOf(RpcException);
		expect(receivedError).toMatchObject({
			code: RpcExceptionCodeEnum.unknownMember,
		});
		expect(receivedError).toHaveProperty("cause", undefined);
		await connector.close();
	});

	it("RPC-STREAM-007 RPC-STREAM-009 defers release across synchronous Source reentrancy", async () => {
		const trace: string[] = [];
		let sourceTeardowns = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.source-reentrancy.v1",
			members: { history: { kind: "stream-method" } },
		});
		connector.peer.expose(descriptor, {
			history() {
				return new Observable((subscriber) => {
					trace.push("source:subscribe");
					subscriber.next("first");
					trace.push("source:after-first");
					subscriber.next("late");
					subscriber.complete();
					subscriber.error(new Error("late raw error"));
					return () => {
						sourceTeardowns += 1;
						trace.push("source:teardown");
					};
				});
			},
		} as never);
		const reservation = sessionHost.reserveIncomingStream({
			service: "example.source-reentrancy.v1",
			member: "history",
			kind: "stream-method",
			args: host.normalizeApplicationArguments(["room"]),
		});
		let incoming: IRpcProtocolIncomingStream | undefined;
		if (reservation?.kind === "source") {
			incoming = reservation.reservation.commit({
				reserveEmission: () => {
					trace.push("protocol:reserve-emission");
					return {
						commit(snapshot) {
							trace.push(`protocol:item:${snapshot.value}`);
							incoming?.finish({ type: "canceled" }, () =>
								trace.push("protocol:on-released"),
							);
						},
						fail() {},
					};
				},
				finish(outcome) {
					trace.push(`protocol:late-terminal:${outcome.type}`);
				},
			});
		}

		await Promise.resolve();
		await Promise.resolve();

		expect(sourceTeardowns).toBe(1);
		expect(trace).toEqual([
			"source:subscribe",
			"protocol:reserve-emission",
			"protocol:item:first",
			"source:after-first",
			"source:teardown",
			"protocol:on-released",
		]);
		await connector.close();
	});

	it("RPC-STREAM-015 releases Source arguments and route references after subscribe settles", async () => {
		class TrackedSource extends Observable<string> {
			constructor() {
				super((subscriber) => subscriber.complete());
			}
		}
		class TrackedImplementation {
			history(): Observable<string> {
				return new TrackedSource();
			}
		}
		const implementationBaseline = queryObjects(TrackedImplementation, {
			format: "count",
		});
		const sourceBaseline = queryObjects(TrackedSource, { format: "count" });

		await (async () => {
			const session: IRpcProtocolSession = {
				reserveInvocation: () => undefined,
				reserveStream: () => undefined,
				forceClose() {},
			};
			const { connector, host, sessionHost } =
				await connectProtocolSession(session);
			const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
				wireName: "example.reference-retirement.v1",
				members: { history: { kind: "stream-method" } },
			});
			const cleanup = connector.peer.expose(
				descriptor,
				new TrackedImplementation() as never,
			);
			const reservation = sessionHost.reserveIncomingStream({
				service: "example.reference-retirement.v1",
				member: "history",
				kind: "stream-method",
				args: host.normalizeApplicationArguments([
					{ room: "detached argument" },
				]),
			});
			let incoming: IRpcProtocolIncomingStream | undefined;
			if (reservation?.kind === "source") {
				incoming = reservation.reservation.commit({
					reserveEmission: () => undefined,
					finish(outcome) {
						incoming?.finish(outcome, () => undefined);
					},
				});
			}
			await Promise.resolve();
			await Promise.resolve();
			cleanup();
			await connector.close();
		})();
		await new Promise<void>((resolveTask) => setImmediate(resolveTask));

		expect(queryObjects(TrackedImplementation, { format: "count" })).toBe(
			implementationBaseline,
		);
		expect(queryObjects(TrackedSource, { format: "count" })).toBe(
			sourceBaseline,
		);
	});

	it("RPC-API-007 omits every Remote Service Group facade", () => {
		const { protocol } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol });

		expect("resolveAll" in acceptor).toBe(false);
		expect(
			Object.getOwnPropertyNames(Object.getPrototypeOf(acceptor)),
		).not.toContain("resolveAll");
	});

	it("RPC-DESC-005 RPC-DESC-009 applies the same duplicate and cleanup rules to Acceptor owner exposure", () => {
		const { protocol } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol });
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
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
			members: { cancel: { kind: "unary", cancelable: true } },
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

describe("streaming Protocol conformance", () => {
	it("RPC-CONFORMANCE-004 publishes and passes the outgoing stream lifecycle case", async () => {
		await expectStreamingConformanceCase("protocol.stream.outgoing-lifecycle");
	});

	it("RPC-STREAM-004 RPC-FLOW-005 RPC-VALID-008 RPC-RESOURCE-012 RPC-CONFORMANCE-004 publishes and passes incoming stream resource-before-route", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.incoming-resource-before-route",
		);
	});

	it("RPC-VALID-008 RPC-VALID-010 RPC-CONFORMANCE-004 publishes and passes incoming stream semantic unknown-member", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.incoming-semantic-unknown-member",
		);
	});

	it("RPC-CONFORMANCE-004 publishes and passes projection disposition rearm", async () => {
		await expectStreamingConformanceCase("protocol.stream.projection-rearm");
	});

	it("RPC-CONFORMANCE-004 publishes and passes Source reserve-before-raw", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.source-reserve-before-raw",
		);
	});

	it("RPC-CONFORMANCE-004 publishes and passes Source W=1 overflow", async () => {
		await expectStreamingConformanceCase("protocol.stream.source-w1-overflow");
	});

	it("RPC-CONFORMANCE-004 publishes and passes item-before-terminal ordering", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.item-before-terminal",
		);
	});

	it("RPC-CONFORMANCE-004 publishes and passes terminal teardown release", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.terminal-teardown-release",
		);
	});

	it("RPC-CONFORMANCE-004 publishes and passes over-credit Session fault classification", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.over-credit-session-fault",
		);
	});

	it("RPC-SPI-017 RPC-CONFORMANCE-004 publishes and passes retained Source Recovery without resubscription", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.recovery-no-resubscribe",
		);
	});

	it("RPC-CONFORMANCE-004 RPC-CONFORMANCE-005 publishes and passes bounded stream fairness progress", async () => {
		await expectStreamingConformanceCase("protocol.stream.fairness-progress");
	});

	it("RPC-SHUTDOWN-013 RPC-SPI-017 RPC-CONFORMANCE-004 publishes and passes stream graceful-to-force shutdown", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.shutdown-graceful-force",
		);
	});

	it("RPC-CONFORMANCE-005 publishes and passes one-direction terminal receipt isolation", async () => {
		await expectStreamingConformanceCase(
			"protocol.receipt.terminal-direction-only",
		);
	});

	it("RPC-CONFORMANCE-004 RPC-CONFORMANCE-005 RPC-TRANSPORT-013 publishes and passes aggregate bounded stream load", async () => {
		await expectStreamingConformanceCase(
			"protocol.stream.aggregate-bounded-load",
		);
		await expectStreamingConformanceCase(
			"protocol.stream.adapter-rejection-is-binding-failure",
		);
	});
});

describe("Adapter startup and Protocol handoff", () => {
	it("RPC-START-005 rejects unknown Connector attempt options without starting its Adapter", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		let adapterStarts = 0;
		const connectionSource = new Subject<IRpcConnection>();
		const adapter: IRpcConnectorAdapter = {
			connection$: connectionSource.asObservable(),
			async connect() {
				adapterStarts += 1;
				const error = new Error("Adapter must not start.");
				connectionSource.error(error);
				throw error;
			},
		};

		await expect(
			connector.connect({ adapter, unknown: true } as never),
		).rejects.toBeInstanceOf(TypeError);

		expect(adapterStarts).toBe(0);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 rejects a pre-aborted Connector attempt without touching its Adapter", async () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const controller = new AbortController();
		controller.abort();
		let adapterReads = 0;
		let adapterStarts = 0;
		const adapter = Object.defineProperty(
			{
				async connect() {
					adapterStarts += 1;
				},
			},
			"connection$",
			{
				get() {
					adapterReads += 1;
					return new Subject<IRpcConnection>().asObservable();
				},
			},
		) as unknown as IRpcConnectorAdapter;

		await expect(
			connector.connect({ adapter, signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });

		expect(adapterReads).toBe(0);
		expect(adapterStarts).toBe(0);
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 aborts an unsettled fresh attempt and releases Connector authority", async () => {
		const { protocol } = createProtocolHarness();
		const connector = createRpcConnector({ protocol });
		const controller = new AbortController();
		let adapterSignal: AbortSignal | undefined;
		const adapter: IRpcConnectorAdapter = {
			connection$: new Subject<IRpcConnection>().asObservable(),
			connect(signal) {
				adapterSignal = signal;
				return new Promise<void>((_resolve, reject) => {
					signal.addEventListener(
						"abort",
						() => reject(new DOMException("Adapter aborted.", "AbortError")),
						{ once: true },
					);
				});
			},
		};

		const startup = connector.connect({ adapter, signal: controller.signal });
		expect(connector.peer.state).toEqual({ status: "connecting" });
		controller.abort();

		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		expect(adapterSignal?.aborted).toBe(true);
		expect(connector.peer.state).toEqual({ status: "unbound" });
		await expect(
			connector.connect({ adapter: undefined as never }),
		).rejects.toBeInstanceOf(TypeError);
	});

	it("RPC-START-005 ignores a reentrant abort after binding success", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							if (host.attachSession(session) === undefined) {
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
		const controller = new AbortController();
		const connectionSource = new Subject<IRpcConnection>();
		let closeCalls = 0;
		const connector = createRpcConnector({ protocol });
		connector.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.peerOpened) {
				controller.abort("caller-controlled reason");
			}
		});

		await connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {
							closeCalls += 1;
						},
					});
					connectionSource.complete();
				},
			},
			signal: controller.signal,
		});

		expect(closeCalls).toBe(0);
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-START-005 keeps AbortError authoritative when abort wins an ordinary-failure race", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		const controller = new AbortController();
		const connectionSource = new Subject<IRpcConnection>();
		const adapterFailure = new Error("Adapter credential=secret");
		const abortReason = new Error("Caller credential=secret");
		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					queueMicrotask(() => {
						connectionSource.error(adapterFailure);
						queueMicrotask(() => controller.abort(abortReason));
					});
				},
			},
			signal: controller.signal,
		});

		const error = await startup.catch((cause: unknown) => cause);

		expect(error).toBeInstanceOf(DOMException);
		expect(error).toMatchObject({ name: "AbortError" });
		expect(error).not.toBe(adapterFailure);
		expect(error).not.toBe(abortReason);
		expect(JSON.stringify(error)).not.toContain("secret");
		expect(connector.peer.state).toEqual({ status: "unbound" });
	});

	it("RPC-START-005 lets reentrant Owner termination win before startup settles", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							if (host.attachSession(session) === undefined) {
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
		const connector = createRpcConnector({ protocol });
		const events: RpcEvent[] = [];
		let closeTask: Promise<void> | undefined;
		connector.event$.subscribe((event) => events.push(event));
		connector.peer.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.connected) {
				closeTask = connector.close();
			}
		});
		const connectionSource = new Subject<IRpcConnection>();

		const startup = connector.connect({
			adapter: {
				connection$: connectionSource.asObservable(),
				async connect() {
					connectionSource.next({
						message$: new Subject<Uint8Array>().asObservable(),
						async send() {},
						async close() {},
					});
					connectionSource.complete();
				},
			},
		});

		await expect(startup).rejects.toMatchObject({ name: "AbortError" });
		await closeTask;
		expect(events.map((event) => event.type)).not.toContain(
			RpcEventTypeEnum.peerOpened,
		);
	});

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
			reserveStream: () => undefined,
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
		const startup = connector.connect({ adapter });
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
				adapter: {
					connection$: connectionSubject.asObservable(),
					async connect() {
						connectionSubject.next(connection);
						connectionSubject.complete();
					},
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
			adapter: {
				connection$: connectionSubject.asObservable(),
				async connect() {
					connectionSubject.complete();
				},
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
			reserveStream: () => undefined,
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
	it("RPC-PKG-007 RPC-PKG-008 RPC-PKG-009 exposes stable string enums for public RPC vocabularies", async () => {
		const protocolEntry = await import("../src/protocol");

		expect(RpcEventDirectionEnum).toEqual({
			incoming: "incoming",
			outgoing: "outgoing",
		});
		expect(RpcStreamStatusEnum).toEqual({
			completed: "completed",
			canceled: "canceled",
			failed: "failed",
			terminated: "terminated",
		});
		expect(RpcExceptionCodeEnum).toEqual({
			canceled: "canceled",
			unavailable: "unavailable",
			outcomeUnknown: "outcome-unknown",
			handlerFailed: "handler-failed",
			unknownService: "unknown-service",
			unknownMethod: "unknown-method",
			unknownMember: "unknown-member",
			overflow: "overflow",
			protocol: "protocol",
		});
		expect(RpcCloseReasonEnum.cleanupFailed).toBe("cleanup-failed");
		expect(RpcCallStatusEnum).toEqual({
			fulfilled: "fulfilled",
			rejected: "rejected",
			terminated: "terminated",
		});
		expect(RpcEventTypeEnum.topologyClosed).toBe("topology-closed");
		expect(RpcCloseOutcomeEnum.failed).toBe("failed");
		expect(RpcStateStatusEnum.recovering).toBe("recovering");
		expect(RpcStateStatusEnum.monitoring).toBe("monitoring");
		expect(RpcStateStatusEnum.reconnecting).toBe("reconnecting");
		expect(RpcStateStatusEnum.waiting).toBe("waiting");
		expect(RpcConnectorReconnectionAttemptFailureStageEnum).toEqual({
			adapterFactory: "adapter-factory",
			connectorAttempt: "connector-attempt",
			attemptTimeout: "attempt-timeout",
		});
		expect(RpcConnectorReconnectionEventTypeEnum).toEqual({
			attemptFailed: "attempt-failed",
		});
		expect(RpcConnectorReconnectionStopReasonEnum).toEqual({
			requested: "requested",
			initialConnectionFailed: "initial-connection-failed",
			retriesExhausted: "retries-exhausted",
			connectorTerminated: "connector-terminated",
		});
		expect(RpcAcceptorListenerStopReasonEnum.resourcePressure).toBe(
			"resource-pressure",
		);
		expect(RpcCallTerminalTypeEnum.sessionTerminated).toBe(
			"session-terminated",
		);
		expect(RpcIncomingCallKindEnum.handler).toBe("handler");
		expect(RpcProtocolSessionTransitionTypeEnum).toEqual({
			draining: "draining",
			recovering: "recovering",
			recovered: "recovered",
			closed: "closed",
		});
		expect(RpcConformanceStatusEnum).toEqual({
			passed: "passed",
			failed: "failed",
		});
		expect(protocolEntry.RpcExceptionCodeEnum).toBe(RpcExceptionCodeEnum);
		expect(protocolEntry.RpcCloseReasonEnum).toBe(RpcCloseReasonEnum);
	});

	it("RPC-CALL-009 exposes a caller-constructible coded RpcException", () => {
		const cause = new Error("trusted local failure");
		const exception = new RpcException(RpcExceptionCodeEnum.unavailable, cause);

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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, events, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
		});
		const remote = connector.peer.resolve(descriptor);
		const admitted = remote.add(1, 2);

		sink?.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.outcomeUnknown,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.continuityFailure,
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
			reserveStream: () => undefined,
			forceClose() {
				operations.push("first-force");
			},
		});
		const second = protocolHost?.admitSession({
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
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

		protocolHost.fault(RpcCloseReasonEnum.protocolFault, fault);

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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
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
			type: RpcCallTerminalTypeEnum.returned,
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
								sink?.finish({
									type: RpcCallTerminalTypeEnum.failed,
									code: RpcExceptionCodeEnum.canceled,
								});
							},
						};
					},
					release() {},
				};
			},
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { cancel: { kind: "unary", cancelable: true } },
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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, events } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
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

describe("explicit peer composition", () => {
	it("RPC-API-008 RPC-STREAM-011 exposes stable peers with independent child work", async () => {
		const harness = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocol: harness.protocol });
		const host = harness.acceptorHosts[0];
		if (host === undefined) {
			throw new Error("Expected an Acceptor Protocol host.");
		}
		const membershipSnapshots: Array<readonly unknown[]> = [];
		acceptor.peers$.subscribe((peers) => membershipSnapshots.push(peers));
		const operations: string[] = [];
		const createSession = (
			name: string,
			outcome:
				| {
						readonly type: RpcCallTerminalTypeEnum.returned;
						readonly value: number;
				  }
				| {
						readonly type: RpcCallTerminalTypeEnum.failed;
						readonly code: RpcExceptionCodeEnum.handlerFailed;
				  },
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
								if (outcome.type === RpcCallTerminalTypeEnum.returned) {
									sink.finish({
										type: RpcCallTerminalTypeEnum.returned,
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
			reserveStream: () => undefined,
			forceClose() {},
		});
		expect(
			host.admitSession(
				createSession("first", {
					type: RpcCallTerminalTypeEnum.returned,
					value: 3,
				}),
			),
		).toBeDefined();
		expect(
			host.admitSession(
				createSession("second", {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.handlerFailed,
				}),
			),
		).toBeDefined();
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.explicit-composition.v1",
			members: {
				add: { kind: "unary" },
				history: { kind: "stream-method" },
				events$: { kind: "stream-property" },
			},
		});
		const peers = acceptor.peers;
		const lateMembershipSnapshots: Array<readonly unknown[]> = [];
		acceptor.peers$.subscribe((snapshot) =>
			lateMembershipSnapshots.push(snapshot),
		);
		const facades = peers.map((peer) => peer.resolve(descriptor));
		const streams = facades.map((facade) => facade.history("room"));
		const results = await Promise.allSettled(
			facades.map((facade) => facade.add(1, 2)),
		);

		expect(Object.isFrozen(peers)).toBe(true);
		expect(membershipSnapshots).toHaveLength(3);
		expect(membershipSnapshots.every(Object.isFrozen)).toBe(true);
		expect(membershipSnapshots.at(-1)).toBe(peers);
		expect(lateMembershipSnapshots).toEqual([peers]);
		expect(acceptor.peers[0]).toBe(peers[0]);
		expect(acceptor.peers[1]).toBe(peers[1]);
		expect(streams[0]).not.toBe(streams[1]);
		expect(operations).toEqual([
			"reserve-first",
			"commit-first",
			"start-first",
			"reserve-second",
			"commit-second",
			"start-second",
		]);
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({
			status: "fulfilled",
			value: 3,
		});
		expect(results[1]).toMatchObject({
			status: "rejected",
			reason: expect.objectContaining({ code: "handler-failed" }),
		});
		if (results[1]?.status !== "rejected") {
			throw new Error(
				"Expected the second independently composed child to reject.",
			);
		}
		expect(results[1].reason).toBeInstanceOf(RpcException);
	});
});

describe("custom Protocol incoming calls", () => {
	it("RPC-SPI-002 RPC-SPI-003 RPC-SPI-005 rejects forged snapshots passed to semantic equality", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
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
			reserveStream: () => undefined,
			forceClose() {
				forceCalls += 1;
				sink?.finish({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
		});
		const result = connector.peer.resolve(descriptor).add(20, 21);

		sink?.finish({
			type: RpcCallTerminalTypeEnum.returned,
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

	it("RPC-SPI-003 rejects extra own fields in an outgoing terminal", async () => {
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
			reserveStream: () => undefined,
			forceClose() {
				forceCalls += 1;
				sink?.finish({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				});
			},
		};
		const { connector } = await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
		});
		const result = connector.peer.resolve(descriptor).add(20, 21);
		const terminal = Object.assign(Object.create(null), {
			type: RpcCallTerminalTypeEnum.returnedVoid,
		}) as Record<string, unknown>;
		terminal.__proto__ = 0;

		sink?.finish(terminal as never);

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
			reserveStream: () => undefined,
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

		call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		});

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
			reserveStream: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			members: { run: { kind: "unary" } },
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

		call.finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
		});

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
			reserveStream: () => undefined,
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

	it("RPC-SPI-003 RPC-SPI-006 rejects extra own fields before incoming lookup", async () => {
		let forceCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {
				forceCalls += 1;
			},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const request = Object.assign(Object.create(null), {
			service: "attacker.service",
			method: "attackerMethod",
			args: host.normalizeApplicationArguments([]),
		}) as Record<string, unknown>;
		request.__proto__ = 0;

		const reservation = sessionHost.reserveIncomingCall(request as never);

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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
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
		call.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: handlerOutcome.value,
		});

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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost, events } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			members: { add: { kind: "unary" } },
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
		unknownService.reservation.commit().finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownService,
		});

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
		unknownMethod.reservation.commit().finish({
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.unknownMethod,
		});

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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } = await connectProtocolSession(
			session,
			{ maxHandlersPerSession: 1 },
		);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			members: { run: { kind: "unary" } },
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
		first.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: firstOutcome.value,
		});
		await Promise.resolve();
		expect(handlerCalls).toBe(2);

		handlerResolvers[1]?.(7);
		const secondOutcome = await second.handlerOutcome;
		if (secondOutcome.type !== "returned") {
			throw new Error("Expected the second handler result.");
		}
		second.finish({
			type: RpcCallTerminalTypeEnum.returned,
			value: secondOutcome.value,
		});
	});

	it("RPC-RESOURCE-001 rejects incoming work before route lookup when the args subcap is reserved", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const { connector, host, sessionHost } =
			await connectProtocolSession(session);
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.deferred.v1",
			members: { run: { kind: "unary" } },
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
		call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });

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
			reserveStream: () => undefined,
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

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(connector.peer.state).toEqual({ status: "recovering" });
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(connector.peer.state).toEqual({ status: "connected" });
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

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

describe("Connector Reconnection", () => {
	it("RPC-RECONNECT-001 rejects malformed or unbounded Reconnection policy", () => {
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
			expect(() =>
				createRpcConnectorReconnection({
					connector,
					adapterFactory,
					policy,
				}),
			).toThrow(TypeError);
		}
		expect(() =>
			createRpcConnectorReconnection({
				connector,
				adapterFactory,
				policy: { unknown: true } as never,
			}),
		).toThrow(TypeError);
		expect(() =>
			createRpcConnectorReconnection({
				connector: {} as never,
				adapterFactory,
			}),
		).toThrow(TypeError);
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

	it("RPC-RECONNECT-001 owns one initial connection and publishes its orchestration state", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							if (host.attachSession(session) === undefined) {
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
		const connector = createRpcConnector({ protocol });
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {},
						});
						connectionSource.complete();
					},
				};
			},
		});
		const states: string[] = [];
		reconnection.state$.subscribe((state) => states.push(state.status));

		expect(reconnection.connector).toBe(connector);
		expect(reconnection.state).toEqual({ status: "idle" });
		await reconnection.connect();

		expect(factoryCalls).toBe(1);
		expect(reconnection.state).toEqual({ status: "monitoring" });
		expect(states).toEqual(["idle", "connecting", "monitoring"]);
		await expect(reconnection.connect()).rejects.toMatchObject({
			code: "unavailable",
		});
	});

	it("RPC-RECONNECT-001 terminates after an initial Adapter Factory failure", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		const cause = new Error("Factory failed.");
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				throw cause;
			},
		});
		let stateCompleted = false;
		reconnection.state$.subscribe({
			complete: () => {
				stateCompleted = true;
			},
		});

		await expect(reconnection.connect()).rejects.toBe(cause);

		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "initial-connection-failed",
		});
		expect(stateCompleted).toBe(true);
	});

	it("RPC-RECONNECT-001 does not retry an ordinary initial Connector failure", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		let factoryCalls = 0;
		const events: unknown[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						const error = new Error("Initial attempt failed.");
						connectionSource.error(error);
						throw error;
					},
				};
			},
			policy: { retryDelaysMs: [0, 0], attemptTimeoutMs: 1 },
		});
		reconnection.event$.subscribe((event) => events.push(event));

		await expect(reconnection.connect()).rejects.toMatchObject({
			code: "unavailable",
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 5));

		expect(factoryCalls).toBe(1);
		expect(events).toEqual([]);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "initial-connection-failed",
		});
	});

	it("RPC-RECONNECT-004 reports Connector termination during the initial attempt", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		let adapterSignal: AbortSignal | undefined;
		const events: unknown[] = [];
		let eventsCompleted = false;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => ({
				connection$: new Subject<IRpcConnection>().asObservable(),
				connect(signal) {
					adapterSignal = signal;
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener(
							"abort",
							() => reject(new DOMException("Adapter aborted.", "AbortError")),
							{ once: true },
						);
					});
				},
			}),
		});
		reconnection.event$.subscribe({
			next: (event) => events.push(event),
			complete: () => {
				eventsCompleted = true;
			},
		});
		const connectTask = reconnection.connect();

		const closeTask = connector.close();
		await expect(connectTask).rejects.toMatchObject({ name: "AbortError" });
		await closeTask;

		expect(adapterSignal?.aborted).toBe(true);
		expect(events).toEqual([]);
		expect(eventsCompleted).toBe(true);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "connector-terminated",
		});
	});

	it("RPC-RECONNECT-002 replays its frozen terminal state to a late subscriber", async () => {
		const reconnection = createRpcConnectorReconnection({
			connector: createRpcConnector({
				protocol: createProtocolHarness().protocol,
			}),
			adapterFactory: () => {
				throw new Error("Factory failed.");
			},
		});
		await reconnection.connect().catch(() => {});
		const observations: unknown[] = [];

		reconnection.state$.subscribe({
			next: (state) => observations.push(state),
			complete: () => observations.push("complete"),
		});

		expect(Object.isFrozen(reconnection.state)).toBe(true);
		expect(observations).toEqual([
			{
				status: "stopped",
				reason: "initial-connection-failed",
			},
			"complete",
		]);
	});

	it("RPC-RECONNECT-002 immediately reconnects a recovering Peer with a fresh Adapter", async () => {
		const session: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
			forceClose() {},
		};
		let sessionHost: IRpcProtocolSessionHost | undefined;
		const protocol: IRpcProtocol = {
			createConnector(host) {
				return {
					bind() {
						return Promise.resolve().then(() => {
							if (sessionHost === undefined) {
								sessionHost = host.attachSession(session);
								if (sessionHost === undefined) {
									throw new Error("The test Session was not attached.");
								}
								return;
							}
							sessionHost.transition({
								type: RpcProtocolSessionTransitionTypeEnum.recovered,
							});
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
		const connector = createRpcConnector({ protocol });
		const adapters: IRpcConnectorAdapter[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				const connectionSource = new Subject<IRpcConnection>();
				const adapter: IRpcConnectorAdapter = {
					connection$: connectionSource.asObservable(),
					async connect() {
						connectionSource.next({
							message$: new Subject<Uint8Array>().asObservable(),
							async send() {},
							async close() {},
						});
						connectionSource.complete();
					},
				};
				adapters.push(adapter);
				return adapter;
			},
		});
		await reconnection.connect();

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		expect(reconnection.state).toEqual({
			status: "reconnecting",
			attempt: 1,
		});
		expect(adapters).toHaveLength(1);
		await vi.waitFor(() => {
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
		expect(adapters).toHaveLength(2);
		expect(adapters[1]).not.toBe(adapters[0]);
		expect(connector.peer.state).toEqual({ status: "connected" });

		sessionHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		expect(reconnection.state).toEqual({
			status: "reconnecting",
			attempt: 1,
		});
		await vi.waitFor(() => {
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
		expect(adapters).toHaveLength(3);
	});

	it("RPC-RECONNECT-002 does not lose a new Recovery before replacement settlement", async () => {
		const peerStateSource = new Subject<{
			readonly status: RpcStateStatusEnum;
		}>();
		let peerState: { readonly status: RpcStateStatusEnum } = {
			status: RpcStateStatusEnum.unbound,
		};
		let connectorCalls = 0;
		const connector = {
			state: { status: RpcStateStatusEnum.active },
			state$: new Observable((subscriber) => {
				subscriber.next({ status: RpcStateStatusEnum.active });
			}),
			peer: {
				get state() {
					return peerState;
				},
				state$: new Observable((subscriber) => {
					subscriber.next(peerState);
					return peerStateSource.subscribe(subscriber);
				}),
			},
			connect() {
				connectorCalls += 1;
				peerState = { status: RpcStateStatusEnum.connected };
				peerStateSource.next(peerState);
				const task = Promise.resolve();
				if (connectorCalls === 2) {
					void task.then(() => {
						peerState = { status: RpcStateStatusEnum.recovering };
						peerStateSource.next(peerState);
					});
				}
				return task;
			},
		} as unknown as IRpcConnector;
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				return createSuccessfulConnectorAdapter();
			},
		});
		await reconnection.connect();
		peerState = { status: RpcStateStatusEnum.recovering };
		peerStateSource.next(peerState);

		await vi.waitFor(() => {
			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
		});
	});

	it("RPC-RECONNECT-003 waits the configured exact delay before a later retry", async () => {
		vi.useFakeTimers();
		try {
			const session: IRpcProtocolSession = {
				reserveInvocation: () => undefined,
				reserveStream: () => undefined,
				forceClose() {},
			};
			let sessionHost: IRpcProtocolSessionHost | undefined;
			const protocol: IRpcProtocol = {
				createConnector(host) {
					return {
						bind() {
							return Promise.resolve().then(() => {
								if (sessionHost === undefined) {
									sessionHost = host.attachSession(session);
									if (sessionHost === undefined) {
										throw new Error("The test Session was not attached.");
									}
									return;
								}
								sessionHost.transition({
									type: RpcProtocolSessionTransitionTypeEnum.recovered,
								});
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
			const connector = createRpcConnector({ protocol });
			let factoryCalls = 0;
			const retryDelaysMs = [100];
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					const connectionSource = new Subject<IRpcConnection>();
					return {
						connection$: connectionSource.asObservable(),
						async connect() {
							if (factoryCalls === 2) {
								const error = new Error("Replacement failed.");
								connectionSource.error(error);
								throw error;
							}
							connectionSource.next({
								message$: new Subject<Uint8Array>().asObservable(),
								async send() {},
								async close() {},
							});
							connectionSource.complete();
						},
					};
				},
				policy: {
					retryDelaysMs,
					attemptTimeoutMs: 1_000,
				},
			});
			const failures: unknown[] = [];
			reconnection.event$.subscribe((event) =>
				failures.push({ event, state: reconnection.state }),
			);
			retryDelaysMs[0] = 0;
			await reconnection.connect();

			sessionHost?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(2);
			expect(reconnection.state).toEqual({
				status: "waiting",
				nextAttempt: 2,
				delayMs: 100,
			});
			expect(failures).toEqual([
				{
					event: {
						type: "attempt-failed",
						attempt: 1,
						stage: "connector-attempt",
						nextDelayMs: 100,
					},
					state: {
						status: "waiting",
						nextAttempt: 2,
						delayMs: 100,
					},
				},
			]);
			await vi.advanceTimersByTimeAsync(99);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
			expect(connector.peer.state).toEqual({ status: "connected" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-003 aborts a replacement attempt at its configured timeout", async () => {
		vi.useFakeTimers();
		try {
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({ protocol: harness.protocol });
			let factoryCalls = 0;
			let replacementSignal: AbortSignal | undefined;
			const failures: unknown[] = [];
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					if (factoryCalls === 1) {
						return createSuccessfulConnectorAdapter();
					}
					return {
						connection$: new Subject<IRpcConnection>().asObservable(),
						connect(signal) {
							replacementSignal = signal;
							return new Promise<void>((_resolve, reject) => {
								signal.addEventListener(
									"abort",
									() =>
										reject(new DOMException("Adapter aborted.", "AbortError")),
									{ once: true },
								);
							});
						},
					};
				},
				policy: { retryDelaysMs: [], attemptTimeoutMs: 50 },
			});
			reconnection.event$.subscribe((event) => failures.push(event));
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			expect(replacementSignal?.aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(49);
			expect(reconnection.state).toEqual({
				status: "reconnecting",
				attempt: 1,
			});
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(replacementSignal?.aborted).toBe(true);
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "retries-exhausted",
			});
			expect(failures).toEqual([
				{
					type: "attempt-failed",
					attempt: 1,
					stage: "attempt-timeout",
				},
			]);
			expect(connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-003 preserves exact delays beyond one platform timer range", async () => {
		vi.useFakeTimers();
		try {
			const maximumTimerDelayMs = 2_147_483_647;
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({ protocol: harness.protocol });
			let factoryCalls = 0;
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					if (factoryCalls !== 2) {
						return createSuccessfulConnectorAdapter();
					}
					const connectionSource = new Subject<IRpcConnection>();
					return {
						connection$: connectionSource.asObservable(),
						async connect() {
							const error = new Error("Replacement failed.");
							connectionSource.error(error);
							throw error;
						},
					};
				},
				policy: {
					retryDelaysMs: [maximumTimerDelayMs + 10],
					attemptTimeoutMs: 1_000,
				},
			});
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			await vi.advanceTimersByTimeAsync(maximumTimerDelayMs);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(9);
			expect(factoryCalls).toBe(2);
			await vi.advanceTimersByTimeAsync(1);
			await vi.advanceTimersByTimeAsync(0);

			expect(factoryCalls).toBe(3);
			expect(reconnection.state).toEqual({ status: "monitoring" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-004 stops a scheduled retry without closing its Connector", async () => {
		vi.useFakeTimers();
		try {
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({ protocol: harness.protocol });
			let factoryCalls = 0;
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					if (factoryCalls === 1) {
						return createSuccessfulConnectorAdapter();
					}
					const connectionSource = new Subject<IRpcConnection>();
					return {
						connection$: connectionSource.asObservable(),
						async connect() {
							const error = new Error("Replacement failed.");
							connectionSource.error(error);
							throw error;
						},
					};
				},
				policy: { retryDelaysMs: [1_000], attemptTimeoutMs: 100 },
			});
			await reconnection.connect();
			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);
			expect(reconnection.state.status).toBe("waiting");

			const stopTask = reconnection.stop();
			expect(reconnection.stop()).toBe(stopTask);
			await stopTask;
			await vi.advanceTimersByTimeAsync(1_000);

			expect(factoryCalls).toBe(2);
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(connector.state).toEqual({ status: "active" });
			expect(connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-004 stops an active replacement before direct Connector takeover", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({ protocol: harness.protocol });
		let factoryCalls = 0;
		let replacementSignal: AbortSignal | undefined;
		const events: unknown[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				return {
					connection$: new Subject<IRpcConnection>().asObservable(),
					connect(signal) {
						replacementSignal = signal;
						return new Promise<void>((_resolve, reject) => {
							signal.addEventListener(
								"abort",
								() =>
									reject(new DOMException("Adapter aborted.", "AbortError")),
								{ once: true },
							);
						});
					},
				};
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 1_000 },
		});
		reconnection.event$.subscribe((event) => events.push(event));
		await reconnection.connect();
		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		await Promise.resolve();
		expect(replacementSignal?.aborted).toBe(false);

		const stopTask = reconnection.stop();
		expect(replacementSignal?.aborted).toBe(true);
		await stopTask;

		expect(events).toEqual([]);
		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "requested",
		});
		expect(connector.peer.state).toEqual({ status: "recovering" });
		await connector.connect({ adapter: createSuccessfulConnectorAdapter() });
		expect(connector.peer.state).toEqual({ status: "connected" });
	});

	it("RPC-RECONNECT-004 stops and awaits an unsettled initial connection attempt", async () => {
		const connector = createRpcConnector({
			protocol: createProtocolHarness().protocol,
		});
		let adapterSignal: AbortSignal | undefined;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => ({
				connection$: new Subject<IRpcConnection>().asObservable(),
				connect(signal) {
					adapterSignal = signal;
					return new Promise<void>((_resolve, reject) => {
						signal.addEventListener(
							"abort",
							() => reject(new DOMException("Adapter aborted.", "AbortError")),
							{ once: true },
						);
					});
				},
			}),
		});
		const connectTask = reconnection.connect();
		let reentrantStopTask: Promise<void> | undefined;
		reconnection.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.stopped) {
				reentrantStopTask = reconnection.stop();
			}
		});

		const stopTask = reconnection.stop();
		try {
			expect(reconnection.stop()).toBe(stopTask);
			expect(reentrantStopTask).toBe(stopTask);
			expect(adapterSignal?.aborted).toBe(true);
			await expect(connectTask).rejects.toMatchObject({ name: "AbortError" });
			await expect(stopTask).resolves.toBeUndefined();
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(connector.peer.state).toEqual({ status: "unbound" });
		} finally {
			await connector.close();
			await connectTask.catch(() => {});
		}
	});

	it("RPC-RECONNECT-004 leaves no retry timer when stop wins from the waiting projection", async () => {
		vi.useFakeTimers();
		try {
			const harness = createReconnectionProtocolHarness();
			const connector = createRpcConnector({ protocol: harness.protocol });
			let factoryCalls = 0;
			const reconnection = createRpcConnectorReconnection({
				connector,
				adapterFactory: () => {
					factoryCalls += 1;
					if (factoryCalls === 1) {
						return createSuccessfulConnectorAdapter();
					}
					const connectionSource = new Subject<IRpcConnection>();
					return {
						connection$: connectionSource.asObservable(),
						async connect() {
							const error = new Error("Replacement failed.");
							connectionSource.error(error);
							throw error;
						},
					};
				},
				policy: { retryDelaysMs: [60_000], attemptTimeoutMs: 1_000 },
			});
			let stopTask: Promise<void> | undefined;
			reconnection.state$.subscribe((state) => {
				if (state.status === RpcStateStatusEnum.waiting) {
					stopTask = reconnection.stop();
				}
			});
			await reconnection.connect();

			harness.sessionHost().transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.advanceTimersByTimeAsync(0);

			await expect(stopTask).resolves.toBeUndefined();
			expect(reconnection.state).toEqual({
				status: "stopped",
				reason: "requested",
			});
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("RPC-RECONNECT-004 observes Connector termination reentrant from monitoring", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({ protocol: harness.protocol });
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: createSuccessfulConnectorAdapter,
		});
		let connectorCloseTask: Promise<void> | undefined;
		reconnection.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.monitoring) {
				connectorCloseTask = connector.close();
			}
		});

		await reconnection.connect();
		await connectorCloseTask;

		expect(reconnection.state).toEqual({
			status: "stopped",
			reason: "connector-terminated",
		});
	});

	it("RPC-RECONNECT-005 emits payload-free failure telemetry after the resulting state", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({ protocol: harness.protocol });
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				const connectionSource = new Subject<IRpcConnection>();
				return {
					connection$: connectionSource.asObservable(),
					async connect() {
						const error = new Error("credential=secret");
						connectionSource.error(error);
						throw error;
					},
				};
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 100 },
		});
		const observations: string[] = [];
		const events: unknown[] = [];
		reconnection.state$.subscribe((state) => {
			if (state.status === "stopped") {
				observations.push("state");
			}
		});
		reconnection.event$.subscribe({
			next: (event) => {
				observations.push("event");
				events.push(event);
			},
			complete: () => observations.push("event-complete"),
		});
		await reconnection.connect();
		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		await vi.waitFor(() => {
			expect(reconnection.state.status).toBe("stopped");
		});
		expect(events).toEqual([
			{
				type: "attempt-failed",
				attempt: 1,
				stage: "connector-attempt",
			},
		]);
		expect(observations).toEqual(["state", "event", "event-complete"]);
		expect(JSON.stringify(events)).not.toContain("secret");
	});

	it("RPC-RECONNECT-005 classifies a background Adapter Factory failure", async () => {
		const harness = createReconnectionProtocolHarness();
		const connector = createRpcConnector({ protocol: harness.protocol });
		let factoryCalls = 0;
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				factoryCalls += 1;
				if (factoryCalls === 1) {
					return createSuccessfulConnectorAdapter();
				}
				throw new Error("endpoint=https://secret.example");
			},
			policy: { retryDelaysMs: [], attemptTimeoutMs: 100 },
		});
		const events: unknown[] = [];
		reconnection.event$.subscribe((event) => events.push(event));
		await reconnection.connect();

		harness.sessionHost().transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		await vi.waitFor(() => {
			expect(reconnection.state.status).toBe("stopped");
		});

		expect(events).toEqual([
			{
				type: "attempt-failed",
				attempt: 1,
				stage: "adapter-factory",
			},
		]);
		expect(JSON.stringify(events)).not.toContain("secret");
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

	it("RPC-SHUTDOWN-002 RPC-SHUTDOWN-013 RPC-SHUTDOWN-014 drains an admitted connected stream through Source release", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.shutdown-stream-drain.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		let sourceTeardowns = 0;
		let observerCompletions = 0;
		connector.peer.expose(descriptor, {
			history: () =>
				new Observable((subscriber) => {
					const subscription = source.subscribe(subscriber);
					return () => {
						sourceTeardowns += 1;
						subscription.unsubscribe();
					};
				}),
		} as never);
		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({
				complete: () => {
					observerCompletions += 1;
				},
			});
		await Promise.resolve();
		await Promise.resolve();

		let settled = false;
		const task = connector.shutdown();
		void task.then(() => {
			settled = true;
		});
		await Promise.resolve();
		await Promise.resolve();

		expect(connector.state).toEqual({ status: "draining" });
		expect(connector.peer.state).toMatchObject({ status: "draining" });
		expect(settled).toBe(false);
		expect(sourceTeardowns).toBe(0);
		expect(observerCompletions).toBe(0);

		source.complete();
		flow.flush();
		await task;

		expect(sourceTeardowns).toBe(1);
		expect(observerCompletions).toBe(1);
		expect(flow.released).toBe(true);
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
		});
	});

	it("RPC-LIFE-001 RPC-LIFE-003 RPC-SHUTDOWN-002 forces a recovering stream at G through the cached task", async () => {
		const flow = createW1SemanticStreamHarness();
		const { connector, sessionHost, events } = await connectProtocolSession(
			flow.session,
		);
		flow.attachIncomingHost(sessionHost);
		const descriptor = createRemoteServiceDescriptor(IMixedExposureService, {
			wireName: "example.shutdown-recovering-stream.v1",
			members: { history: { kind: "stream-method" } },
		});
		const source = new Subject<string>();
		let sourceTeardowns = 0;
		const observerErrors: unknown[] = [];
		connector.peer.expose(descriptor, {
			history: () =>
				new Observable((subscriber) => {
					const subscription = source.subscribe(subscriber);
					return () => {
						sourceTeardowns += 1;
						subscription.unsubscribe();
					};
				}),
		} as never);
		connector.peer
			.resolve(descriptor)
			.history("room")
			.subscribe({ error: (error) => observerErrors.push(error) });
		await Promise.resolve();
		await Promise.resolve();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});

		const task = connector.shutdown();

		expect(connector.shutdown()).toBe(task);
		expect(flow.forceCloseCount).toBe(1);
		expect(sourceTeardowns).toBe(1);
		expect(flow.released).toBe(true);
		expect(observerErrors).toMatchObject([
			{ code: RpcExceptionCodeEnum.outcomeUnknown },
		]);
		expect(connector.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(
			events.filter((event) => event.type === RpcEventTypeEnum.streamFinished),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					direction: RpcEventDirectionEnum.incoming,
					outcome: RpcStreamStatusEnum.terminated,
				}),
				expect.objectContaining({
					direction: RpcEventDirectionEnum.outgoing,
					outcome: RpcStreamStatusEnum.failed,
					code: RpcExceptionCodeEnum.outcomeUnknown,
				}),
			]),
		);

		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		await task;

		expect(connector.shutdown()).toBe(task);
		expect(connector.close()).toBe(task);
		expect(flow.forceCloseCount).toBe(1);
		expect(sourceTeardowns).toBe(1);
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "graceful-shutdown",
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
			reserveStream: () => undefined,
			forceClose() {},
		};
		const recoveringSession: IRpcProtocolSession = {
			reserveInvocation: () => undefined,
			reserveStream: () => undefined,
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
		recoveringHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
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
			reserveStream: () => undefined,
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

describe("normative evidence registry", () => {
	const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
	const auditScript = resolve(packageRoot, "scripts/evidence-registry.mjs");

	it("RPC-EVIDENCE-004 RPC-EVIDENCE-013 verifies every close-delimited active and retired identity", () => {
		const result = spawnSync(
			process.execPath,
			[
				auditScript,
				"ledger",
				"--legacy-preserve",
				"153",
				"--legacy-retire",
				"48",
				"--active",
				"343",
			],
			{ cwd: packageRoot, encoding: "utf8" },
		);

		expect(result.stderr).toBe("");
		expect(result.status).toBe(0);
	});

	it("RPC-EVIDENCE-011 enforces zero unfinished nodes and reports the exact external release boundary", () => {
		const result = spawnSync(
			process.execPath,
			[auditScript, "graph", "--inverse", "--zero-incomplete"],
			{ cwd: packageRoot, encoding: "utf8" },
		);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(
			"type.requirement.value-007: status=planned",
		);
		expect(result.stderr).toContain(
			"package.requirement.release-025: status=planned",
		);
	});
});
