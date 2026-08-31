/**
 * @overview Public-seam evidence for caller and Framework requirements.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { config, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import * as rootEntry from "../../src/index";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcAcceptor,
	type IRpcConnection,
	type IRpcConnector,
	RpcCloseReasonEnum,
	type RpcEvent,
	type RpcProtocolAcceptorFactory,
	type RpcProtocolConnectorFactory,
} from "../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolConnectorHost,
	IRpcProtocolInvocationRequest,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../src/protocol";
import * as protocolEntry from "../../src/protocol";
import {
	RpcCallTerminalTypeEnum,
	RpcProtocolSessionTransitionTypeEnum,
} from "../../src/protocol";
import * as transportEntry from "../../src/transport";

interface RequirementService {
	cancel(value: string, signal: AbortSignal): Promise<string>;
	echo(value: { readonly secret: string }): { readonly secret: string };
	wait(): Promise<string>;
}

interface ConnectorHarnessOptions {
	readonly session?: IRpcProtocolSession;
	readonly shutdown?: () => Promise<void>;
	readonly close?: () => void;
	readonly cleanup?: () => Promise<void>;
}

const IRequirementService = createServiceIdentifier<RequirementService>(
	"IRequirementService",
);
const requirementDescriptor = createRemoteServiceDescriptor(
	IRequirementService,
	{
		wireName: "example.requirements.v1",
		methods: { cancel: { cancelable: true }, echo: true, wait: true },
	},
);

function createEmptySession(): IRpcProtocolSession {
	return {
		reserveInvocation: () => undefined,
		forceClose() {},
	};
}

function createConnectorHarness(options: ConnectorHarnessOptions = {}): {
	readonly connector: IRpcConnector;
	readonly host: IRpcProtocolConnectorHost;
	readonly session: IRpcProtocolSession;
	readonly events: RpcEvent[];
	readonly calls: {
		bind: number;
		shutdown: number;
		close: number;
		cleanup: number;
		connectionClose: number;
	};
	connect(): Promise<IRpcProtocolSessionHost>;
} {
	const session = options.session ?? createEmptySession();
	const calls = {
		bind: 0,
		shutdown: 0,
		close: 0,
		cleanup: 0,
		connectionClose: 0,
	};
	let connectorHost: IRpcProtocolConnectorHost | undefined;
	let sessionHost: IRpcProtocolSessionHost | undefined;
	const protocolFactory: RpcProtocolConnectorFactory = (host) => {
		connectorHost = host;
		return {
			bind(connection) {
				calls.bind += 1;
				connection.message$.subscribe();
				return Promise.resolve().then(() => {
					sessionHost = host.attachSession(session);
					if (sessionHost === undefined) {
						throw new Error("Expected the test Session to attach.");
					}
				});
			},
			shutdown() {
				calls.shutdown += 1;
				return options.shutdown?.() ?? Promise.resolve();
			},
			close() {
				calls.close += 1;
				options.close?.();
			},
			cleanup() {
				calls.cleanup += 1;
				return options.cleanup?.() ?? Promise.resolve();
			},
		};
	};
	const connector = createRpcConnector({
		protocolFactory,
		runtimePolicy: { shutdownDeadlineMs: 50 },
	});
	if (connectorHost === undefined) {
		throw new Error("Expected a Connector Protocol host.");
	}
	const host = connectorHost;
	const events: RpcEvent[] = [];
	connector.event$.subscribe((event) => events.push(event));

	return {
		connector,
		host,
		session,
		events,
		calls,
		async connect() {
			const connectionSource = new Subject<IRpcConnection>();
			const messageSource = new Subject<Uint8Array>();
			await connector.connect({
				adapter: {
					connection$: connectionSource.asObservable(),
					connect() {
						connectionSource.next({
							message$: messageSource.asObservable(),
							async send() {},
							async close() {
								calls.connectionClose += 1;
								messageSource.complete();
							},
						});
						connectionSource.complete();
						return Promise.resolve();
					},
				},
			});
			if (sessionHost === undefined) {
				throw new Error("Expected a Connector Protocol Session host.");
			}
			return sessionHost;
		},
	};
}

function createAcceptorHarness(
	options: { readonly cleanup?: () => Promise<void> } = {},
): {
	readonly acceptor: IRpcAcceptor;
	readonly host: IRpcProtocolAcceptorHost;
} {
	let acceptorHost: IRpcProtocolAcceptorHost | undefined;
	const protocolFactory: RpcProtocolAcceptorFactory = (host) => {
		acceptorHost = host;
		return {
			async accept() {},
			async shutdown() {},
			close() {},
			cleanup: options.cleanup ?? (() => Promise.resolve()),
		};
	};
	const acceptor = createRpcAcceptor({
		protocolFactory,
		runtimePolicy: { shutdownDeadlineMs: 50 },
	});
	if (acceptorHost === undefined) {
		throw new Error("Expected an Acceptor Protocol host.");
	}
	return { acceptor, host: acceptorHost };
}

describe("Framework requirement evidence", () => {
	it("RPC-BASE-002 keeps public Observable subscriptions resource-neutral", () => {
		let connectorCreations = 0;
		let acceptorCreations = 0;
		let bindCalls = 0;
		let acceptCalls = 0;
		const connectorProtocolFactory: RpcProtocolConnectorFactory = () => {
			connectorCreations += 1;
			return {
				async bind() {
					bindCalls += 1;
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const acceptorProtocolFactory: RpcProtocolAcceptorFactory = () => {
			acceptorCreations += 1;
			return {
				async accept() {
					acceptCalls += 1;
				},
				async shutdown() {},
				close() {},
				async cleanup() {},
			};
		};
		const connector = createRpcConnector({
			protocolFactory: connectorProtocolFactory,
		});
		const acceptor = createRpcAcceptor({
			protocolFactory: acceptorProtocolFactory,
		});
		const before = [
			connectorCreations,
			acceptorCreations,
			bindCalls,
			acceptCalls,
		];
		const subscriptions = [
			connector.state$.subscribe(),
			connector.peer.state$.subscribe(),
			connector.event$.subscribe(),
			acceptor.state$.subscribe(),
			acceptor.peers$.subscribe(),
			acceptor.event$.subscribe(),
		];

		for (const subscription of subscriptions) {
			subscription.unsubscribe();
		}

		expect([
			connectorCreations,
			acceptorCreations,
			bindCalls,
			acceptCalls,
		]).toEqual(before);
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(acceptor.peers).toEqual([]);
	});

	it("RPC-BASE-003 RPC-EVENT-005 RPC-POLICY-004 keeps private machinery out of public runtime surfaces", () => {
		expect(Object.keys(rootEntry).sort()).toEqual([
			"RpcAcceptorListenerStopReasonEnum",
			"RpcCallDirectionEnum",
			"RpcCallStatusEnum",
			"RpcCloseOutcomeEnum",
			"RpcCloseReasonEnum",
			"RpcConnectorReconnectionAttemptFailureStageEnum",
			"RpcConnectorReconnectionEventTypeEnum",
			"RpcConnectorReconnectionStopReasonEnum",
			"RpcEventTypeEnum",
			"RpcException",
			"RpcExceptionCodeEnum",
			"RpcStateStatusEnum",
			"createRemoteServiceDescriptor",
			"createRpcAcceptor",
			"createRpcConnector",
			"createRpcConnectorReconnection",
			"createRpcProtocolAcceptor",
			"createRpcProtocolConnector",
		]);
		expect(Object.keys(protocolEntry).sort()).toEqual([
			"RpcCallTerminalTypeEnum",
			"RpcCloseReasonEnum",
			"RpcExceptionCodeEnum",
			"RpcIncomingCallKindEnum",
			"RpcProtocolSessionTransitionTypeEnum",
			"createRpcProtocolAcceptor",
			"createRpcProtocolConnector",
		]);
		expect(Object.keys(transportEntry)).toEqual([]);

		const connector = createRpcConnector();
		const publicKeys = Reflect.ownKeys(connector).map(String);
		const forbidden =
			/(codec|handshake|proof|ack|sequence|replay|ledger|scheduler|queue|lane|permit|priority|pause|resume|transcript|telemetry|trace|exporter|redact|capacity)/iu;
		expect(publicKeys.filter((key) => forbidden.test(key))).toEqual([]);
		expect(
			Reflect.ownKeys(connector.peer)
				.map(String)
				.filter((key) => forbidden.test(key)),
		).toEqual([]);
	});

	it("RPC-VALUE-003 enforces the common Application Value profile before a custom Protocol reservation", async () => {
		let reservationCalls = 0;
		let capturedRequest: IRpcProtocolInvocationRequest | undefined;
		const session: IRpcProtocolSession = {
			reserveInvocation(request) {
				reservationCalls += 1;
				capturedRequest = request;
				return {
					commit(sink) {
						return {
							start() {
								sink.finish({ type: RpcCallTerminalTypeEnum.returnedVoid });
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		const input = { secret: "caller-owned" };

		await expect(
			harness.connector.peer.resolve(requirementDescriptor).echo(input),
		).resolves.toBeUndefined();
		input.secret = "mutated";
		expect(capturedRequest?.args.value).toEqual([{ secret: "caller-owned" }]);
		expect(Object.isFrozen(capturedRequest?.args.value[0])).toBe(true);

		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo(new Map() as never),
		).rejects.toBeInstanceOf(TypeError);
		expect(reservationCalls).toBe(1);
		await harness.connector.close();
	});

	it("RPC-DESC-005 keeps an admitted handler route after synchronous idempotent cleanup", async () => {
		const harness = createConnectorHarness();
		const sessionHost = await harness.connect();
		const cleanup = harness.connector.peer.expose(requirementDescriptor, {
			async cancel(value) {
				return value;
			},
			echo: ({ secret }) => ({ secret: `captured:${secret}` }),
			async wait() {
				return "done";
			},
		});
		const reservation = sessionHost.reserveIncomingCall({
			service: "example.requirements.v1",
			method: "echo",
			args: harness.host.normalizeApplicationArguments([{ secret: "value" }]),
		});
		expect(reservation?.kind).toBe("handler");

		expect(cleanup()).toBeUndefined();
		expect(() => cleanup()).not.toThrow();
		if (reservation?.kind !== "handler") {
			throw new Error("Expected a captured handler reservation.");
		}
		const call = reservation.reservation.commit();
		await expect(call.handlerOutcome).resolves.toMatchObject({
			type: "returned",
			value: { value: { secret: "captured:value" } },
		});
		call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });
		await harness.connector.close();
	});

	it("RPC-API-006 gates exposure synchronously while allowing unbound and recovering peers", async () => {
		const harness = createConnectorHarness();
		const unboundCleanup = harness.connector.peer.expose(
			requirementDescriptor,
			{
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			},
		);
		unboundCleanup();
		const sessionHost = await harness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		const recoveringCleanup = harness.connector.peer.expose(
			requirementDescriptor,
			{
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			},
		);
		recoveringCleanup();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.draining,
			reason: RpcCloseReasonEnum.counterExhaustion,
		});

		expect(() =>
			harness.connector.peer.expose(requirementDescriptor, {
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			}),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		await harness.connector.close();
		expect(() =>
			harness.connector.peer.expose(requirementDescriptor, {
				async cancel(value) {
					return value;
				},
				echo: (value) => value,
				async wait() {
					return "done";
				},
			}),
		).toThrow(expect.objectContaining({ code: "unavailable" }));

		const { acceptor, host } = createAcceptorHarness();
		const implementation = {
			async cancel(value: string) {
				return value;
			},
			echo: (value: { readonly secret: string }) => value,
			async wait() {
				return "done";
			},
		};
		const ownerCleanup = acceptor.expose(requirementDescriptor, implementation);
		const futureSessionHost = host.admitSession(createEmptySession());
		expect(
			futureSessionHost?.reserveIncomingCall({
				service: "example.requirements.v1",
				method: "wait",
				args: host.normalizeApplicationArguments([]),
			})?.kind,
		).toBe("handler");
		ownerCleanup();
		const currentSessionHost = host.admitSession(createEmptySession());
		const currentCleanup = acceptor.expose(
			requirementDescriptor,
			implementation,
		);
		expect(
			currentSessionHost?.reserveIncomingCall({
				service: "example.requirements.v1",
				method: "wait",
				args: host.normalizeApplicationArguments([]),
			})?.kind,
		).toBe("handler");
		currentCleanup();
		const gatedPeer = acceptor.peers[0];
		const acceptorClose = acceptor.close();
		expect(() =>
			acceptor.expose(requirementDescriptor, implementation),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		expect(() =>
			gatedPeer?.expose(requirementDescriptor, implementation),
		).toThrow(expect.objectContaining({ code: "unavailable" }));
		await acceptorClose;
	});

	it("RPC-CALL-004 applies control, abort, availability, value, then capacity preflight without observations", async () => {
		const unbound = createRpcConnector();
		const cancel = unbound.peer.resolve(requirementDescriptor)
			.cancel as unknown as (...args: unknown[]) => Promise<unknown>;
		await expect(cancel()).rejects.toBeInstanceOf(TypeError);
		const aborted = new AbortController();
		aborted.abort();
		await expect(cancel(new Map(), aborted.signal)).rejects.toMatchObject({
			code: "canceled",
		});
		await expect(
			unbound.peer.resolve(requirementDescriptor).echo(new Map() as never),
		).rejects.toMatchObject({ code: "unavailable" });
		await unbound.close();

		let reservationCalls = 0;
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				reservationCalls += 1;
				return undefined;
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo(new Map() as never),
		).rejects.toBeInstanceOf(TypeError);
		expect(reservationCalls).toBe(0);
		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "valid" }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(reservationCalls).toBe(1);
		expect(
			harness.events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await harness.connector.close();
	});

	it("RPC-START-001 gates before Adapter inspection and reports shape failures only by Promise rejection", async () => {
		const closedConnector = createRpcConnector();
		await closedConnector.close();
		let connectorSourceReads = 0;
		const gatedConnectorAdapter = Object.defineProperty({}, "connection$", {
			get() {
				connectorSourceReads += 1;
				throw new Error("must not inspect gated Adapter");
			},
		});
		let gatedConnectorTask: Promise<void> | undefined;
		expect(() => {
			gatedConnectorTask = closedConnector.connect({
				adapter: gatedConnectorAdapter as never,
			});
		}).not.toThrow();
		await expect(gatedConnectorTask).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(connectorSourceReads).toBe(0);

		const connector = createRpcConnector();
		let invalidConnectorTask: Promise<void> | undefined;
		expect(() => {
			invalidConnectorTask = connector.connect({ adapter: {} as never });
		}).not.toThrow();
		await expect(invalidConnectorTask).rejects.toBeInstanceOf(TypeError);
		await connector.close();

		const closedAcceptor = createRpcAcceptor();
		await closedAcceptor.close();
		let acceptorSourceReads = 0;
		const gatedAcceptorAdapter = Object.defineProperty({}, "connection$", {
			get() {
				acceptorSourceReads += 1;
				throw new Error("must not inspect gated Adapter");
			},
		});
		let gatedAcceptorTask: Promise<void> | undefined;
		expect(() => {
			gatedAcceptorTask = closedAcceptor.listen(gatedAcceptorAdapter as never);
		}).not.toThrow();
		await expect(gatedAcceptorTask).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(acceptorSourceReads).toBe(0);

		const acceptor = createRpcAcceptor();
		let invalidAcceptorTask: Promise<void> | undefined;
		expect(() => {
			invalidAcceptorTask = acceptor.listen({} as never);
		}).not.toThrow();
		await expect(invalidAcceptorTask).rejects.toBeInstanceOf(TypeError);
		await acceptor.close();
	});

	it("RPC-SPI-009 retains Connector identity and rejects Acceptor admission before publishing excess peers", async () => {
		const connectorHarness = createConnectorHarness();
		const stablePeer = connectorHarness.connector.peer;
		const sessionHost = await connectorHarness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(connectorHarness.connector.peer).toBe(stablePeer);
		expect(
			connectorHarness.host.attachSession(createEmptySession()),
		).toBeUndefined();

		const { acceptor, host } = createAcceptorHarness();
		const firstSession = createEmptySession();
		const firstHost = host.admitSession(firstSession);
		expect(firstHost).toBeDefined();
		const firstPeer = acceptor.peers[0];
		firstHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		firstHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(acceptor.peers[0]).toBe(firstPeer);
		expect(host.admitSession(firstSession)).toBeUndefined();
		for (let index = 1; index < 64; index += 1) {
			expect(host.admitSession(createEmptySession())).toBeDefined();
		}
		expect(acceptor.peers).toHaveLength(64);
		expect(host.admitSession(createEmptySession())).toBeUndefined();
		expect(acceptor.peers).toHaveLength(64);
		await Promise.all([connectorHarness.connector.close(), acceptor.close()]);
	});

	it("RPC-EVENT-004 RPC-EVENT-007 keeps call observations safe, saturated, local, and pair-stable", async () => {
		const requests: IRpcProtocolInvocationRequest[] = [];
		const session: IRpcProtocolSession = {
			reserveInvocation(request) {
				requests.push(request);
				return {
					commit(sink: IRpcProtocolInvocationSink) {
						return {
							start() {
								sink.finish({
									type: RpcCallTerminalTypeEnum.returned,
									value: harness.host.normalizeApplicationValue({
										secret: "result-secret",
									}),
								});
							},
							cancel() {},
						};
					},
					release() {},
				};
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		const nowValues = [100.9, 99.1, 0, Number.MAX_SAFE_INTEGER + 100];
		const now = vi.spyOn(Date, "now").mockImplementation(() => {
			const value = nowValues.shift();
			return value ?? 0;
		});
		try {
			await harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "argument-secret" });
			await harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "second-secret" });
		} finally {
			now.mockRestore();
		}

		const callEvents = harness.events.filter(
			(event) =>
				event.type === "call-started" || event.type === "call-finished",
		);
		expect(callEvents).toHaveLength(4);
		expect(callEvents[0]?.observationId).toBe(callEvents[1]?.observationId);
		expect(callEvents[2]?.observationId).toBe(callEvents[3]?.observationId);
		expect(callEvents[0]?.observationId).not.toBe(callEvents[2]?.observationId);
		expect(
			callEvents.filter((event) => event.type === "call-finished"),
		).toMatchObject([
			{ durationMs: 0 },
			{ durationMs: Number.MAX_SAFE_INTEGER },
		]);
		for (const event of callEvents) {
			const serialized = JSON.stringify(event);
			expect(serialized).not.toContain("argument-secret");
			expect(serialized).not.toContain("result-secret");
			expect(serialized).not.toMatch(
				/(args|result|details|stack|cause|sessionId|callId|sequence|ack|cursor|epoch|proof|credential|resumeToken|token)/iu,
			);
			expect(Object.values(event).some((value) => value instanceof Error)).toBe(
				false,
			);
		}
		expect(Reflect.ownKeys(requests[0] ?? {})).toEqual([
			"service",
			"method",
			"args",
		]);
		await harness.connector.close();
	});

	it("RPC-API-004 RPC-EVENT-006 keeps event delivery hot and peer terminal reasons local to Acceptor", async () => {
		const { acceptor, host } = createAcceptorHarness();
		const session = createEmptySession();
		const events: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => events.push(event));
		const sessionHost = host.admitSession(session);
		if (sessionHost === undefined) {
			throw new Error("Expected an admitted Acceptor Session.");
		}
		const lateEvents: RpcEvent[] = [];
		let completed = 0;
		let errors = 0;
		acceptor.event$.subscribe({
			next: (event) => lateEvents.push(event),
			error: () => {
				errors += 1;
			},
			complete: () => {
				completed += 1;
			},
		});
		expect(lateEvents).toEqual([]);
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});
		expect(acceptor.state.status).toBe("active");
		expect(acceptor.peers).toEqual([]);
		expect(lateEvents).toMatchObject([
			{ type: "peer-closed", reason: "remote-terminated" },
		]);
		expect(lateEvents[0]).toBe(events[events.length - 1]);
		expect(events.some((event) => event.type === "topology-closed")).toBe(
			false,
		);
		const connectionSource = new Subject<IRpcConnection>();
		await acceptor.listen({
			connection$: connectionSource.asObservable(),
			async listen() {},
		});
		connectionSource.complete();
		expect(acceptor.state).toMatchObject({
			status: "active",
			listener: { status: "stopped", reason: "completed" },
		});
		expect(events.some((event) => event.type === "topology-closed")).toBe(
			false,
		);

		await acceptor.close();
		expect(
			events.filter((event) => event.type === "topology-closed"),
		).toHaveLength(1);
		expect(completed).toBe(1);
		expect(errors).toBe(0);
	});

	it("RPC-API-004 isolates an event subscriber failure from the committed Framework mutation", async () => {
		const harness = createConnectorHarness();
		const sessionHost = await harness.connect();
		const subscriberFailure = new Error("subscriber failure");
		const reported: unknown[] = [];
		const previousUnhandledError = config.onUnhandledError;
		config.onUnhandledError = (error) => reported.push(error);
		const subscription = harness.connector.event$.subscribe(() => {
			throw subscriberFailure;
		});
		try {
			sessionHost.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
			});
			await vi.waitFor(() => expect(reported).toContain(subscriberFailure));
			expect(harness.connector.peer.state).toEqual({ status: "recovering" });
		} finally {
			subscription.unsubscribe();
			config.onUnhandledError = previousUnhandledError;
		}
		await harness.connector.close();
	});

	it("RPC-API-005 publishes terminal observations only after the related public snapshots commit", async () => {
		const harness = createConnectorHarness();
		await harness.connect();
		let taskSettled = false;
		const observations: {
			readonly event: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly taskSettled: boolean;
		}[] = [];
		harness.connector.event$.subscribe((event) => {
			if (
				event.type === "peer-closed" ||
				event.type === "owner-closing" ||
				event.type === "topology-closed"
			) {
				observations.push({
					event: event.type,
					ownerStatus: harness.connector.state.status,
					peerStatus: harness.connector.peer.state.status,
					taskSettled,
				});
			}
		});

		const task = harness.connector.close().then(() => {
			taskSettled = true;
		});
		await task;

		expect(observations).toEqual([
			{
				event: "peer-closed",
				ownerStatus: "closing",
				peerStatus: "closed",
				taskSettled: false,
			},
			{
				event: "owner-closing",
				ownerStatus: "closing",
				peerStatus: "closed",
				taskSettled: false,
			},
			{
				event: "topology-closed",
				ownerStatus: "closed",
				peerStatus: "closed",
				taskSettled: false,
			},
		]);
	});

	it("RPC-STATE-003 preserves a terminal peer reason when Owner cleanup fails", async () => {
		const cleanupError = new Error("cleanup failed");
		const harness = createConnectorHarness({
			cleanup: () => Promise.reject(cleanupError),
		});
		const sessionHost = await harness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.closed,
			reason: RpcCloseReasonEnum.remoteTerminated,
		});

		await expect(harness.connector.close()).rejects.toBe(cleanupError);
		expect(harness.connector.state).toEqual({
			status: "closed",
			outcome: "failed",
			reason: "cleanup-failed",
			error: cleanupError,
		});
		expect(harness.connector.peer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "remote-terminated",
		});
	});
});
