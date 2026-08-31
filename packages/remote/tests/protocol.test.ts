/**
 * @overview Built-in Default RPC Protocol integration tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRpcCounterExhaustionProtocolAcceptorForTest,
	createRpcCounterExhaustionProtocolConnectorForTest,
} from "../src/factories/rpc-protocol.factory";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	type IRpcAcceptorAdapter,
	type IRpcConnection,
	type IRpcConnectorAdapter,
} from "../src/index";
import { createRpcSecurityCarrier } from "../src/utils/protocol/rpc-base64-url-32-schema.util";

interface CalculatorService {
	add(left: number, right: number): number;
}

interface DeferredCalculatorService {
	add(left: number, right: number): Promise<number>;
}

interface CapturedRecord {
	readonly direction: "connector" | "acceptor";
	readonly value: Readonly<Record<string, unknown>>;
}

interface RecoveryCapturedRecord extends CapturedRecord {
	readonly connectionId: number;
}

interface RecoverySendFault {
	readonly drop?: boolean;
	readonly error?: Error;
	readonly message?: Uint8Array;
	readonly peerError?: Error;
	readonly settlement?: Promise<void>;
}

interface RecoveryLink {
	readonly connectorIngress: Subject<Uint8Array>;
	readonly acceptorIngress: Subject<Uint8Array>;
}

interface RawRecoveryConnection {
	readonly connectionId: number;
	readonly responses: Readonly<Record<string, unknown>>[];
	send(record: Readonly<Record<string, unknown>>): void;
}

afterEach(() => vi.useRealTimers());

const ICalculatorService =
	createServiceIdentifier<CalculatorService>("ICalculatorService");
const IDeferredCalculatorService =
	createServiceIdentifier<DeferredCalculatorService>(
		"IDeferredCalculatorService",
	);

function collectPublicErrorText(error: unknown): string {
	const cause =
		error instanceof Error && "cause" in error ? error.cause : undefined;
	return [
		String(error),
		error instanceof Error ? error.stack : undefined,
		String(cause),
		cause instanceof Error ? cause.stack : undefined,
	].join("\n");
}

function createMemoryAdapters(
	transform?: (
		direction: "connector" | "acceptor",
		message: Uint8Array,
	) => Uint8Array,
): {
	readonly connectorAdapter: IRpcConnectorAdapter;
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: CapturedRecord[];
	readonly maximumConcurrentSends: Readonly<
		Record<"connector" | "acceptor", number>
	>;
} {
	const connectorConnections = new Subject<IRpcConnection>();
	const acceptorConnections = new Subject<IRpcConnection>();
	const connectorIngress = new Subject<Uint8Array>();
	const acceptorIngress = new Subject<Uint8Array>();
	const records: CapturedRecord[] = [];
	const concurrentSends = { connector: 0, acceptor: 0 };
	const maximumConcurrentSends = { connector: 0, acceptor: 0 };
	const decoder = new TextDecoder();

	const createConnection = (
		direction: "connector" | "acceptor",
		messageSource: Subject<Uint8Array>,
		peerSource: Subject<Uint8Array>,
	): IRpcConnection => ({
		message$: messageSource.asObservable(),
		async send(message) {
			concurrentSends[direction] += 1;
			maximumConcurrentSends[direction] = Math.max(
				maximumConcurrentSends[direction],
				concurrentSends[direction],
			);
			if (concurrentSends[direction] !== 1) {
				throw new Error(`${direction} started overlapping sends.`);
			}
			try {
				const snapshot = message.slice();
				records.push({
					direction,
					value: JSON.parse(decoder.decode(snapshot)) as Readonly<
						Record<string, unknown>
					>,
				});
				await Promise.resolve();
				peerSource.next(transform?.(direction, snapshot) ?? snapshot);
			} finally {
				concurrentSends[direction] -= 1;
			}
		},
		async close() {
			messageSource.complete();
			peerSource.complete();
		},
	});

	const connectorConnection = createConnection(
		"connector",
		connectorIngress,
		acceptorIngress,
	);
	const acceptorConnection = createConnection(
		"acceptor",
		acceptorIngress,
		connectorIngress,
	);

	return {
		connectorAdapter: {
			connection$: connectorConnections.asObservable(),
			async connect() {
				connectorConnections.next(connectorConnection);
				acceptorConnections.next(acceptorConnection);
				connectorConnections.complete();
			},
		},
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen() {},
		},
		records,
		maximumConcurrentSends,
	};
}

function createRecoveryNetwork(): {
	readonly acceptorAdapter: IRpcAcceptorAdapter;
	readonly records: RecoveryCapturedRecord[];
	createConnectorAdapter(
		fault?: (
			record: RecoveryCapturedRecord,
			message: Uint8Array,
		) => RecoverySendFault,
		closeBehavior?: "propagate" | "silent",
	): IRpcConnectorAdapter;
	openRawConnection(): RawRecoveryConnection;
	disconnect(connectionId: number): void;
	disconnectSide(connectionId: number, side: "connector" | "acceptor"): void;
	emit(
		connectionId: number,
		target: "connector" | "acceptor",
		record: Readonly<Record<string, unknown>>,
	): void;
	directCloseCount(connectionId: number): number;
} {
	const acceptorConnections = new Subject<IRpcConnection>();
	const links = new Map<number, RecoveryLink>();
	const directCloseCounts = new Map<number, number>();
	const records: RecoveryCapturedRecord[] = [];
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let nextConnectionId = 0;

	return {
		acceptorAdapter: {
			connection$: acceptorConnections.asObservable(),
			async listen() {},
		},
		records,
		createConnectorAdapter(fault, closeBehavior = "propagate") {
			const connectorConnections = new Subject<IRpcConnection>();
			return {
				connection$: connectorConnections.asObservable(),
				async connect() {
					nextConnectionId += 1;
					const connectionId = nextConnectionId;
					const connectorIngress = new Subject<Uint8Array>();
					const acceptorIngress = new Subject<Uint8Array>();
					links.set(connectionId, { connectorIngress, acceptorIngress });
					let closed = false;
					const close = async (): Promise<void> => {
						if (closed) {
							return;
						}
						closed = true;
						directCloseCounts.set(
							connectionId,
							(directCloseCounts.get(connectionId) ?? 0) + 1,
						);
						if (closeBehavior === "propagate") {
							connectorIngress.complete();
							acceptorIngress.complete();
						}
					};
					const createConnection = (
						direction: "connector" | "acceptor",
						messageSource: Subject<Uint8Array>,
						peerSource: Subject<Uint8Array>,
					): IRpcConnection => ({
						message$: messageSource.asObservable(),
						async send(message) {
							const snapshot = message.slice();
							const record: RecoveryCapturedRecord = {
								connectionId,
								direction,
								value: JSON.parse(decoder.decode(snapshot)) as Readonly<
									Record<string, unknown>
								>,
							};
							records.push(record);
							const selected = fault?.(record, snapshot);
							await Promise.resolve();
							if (selected?.drop !== true) {
								peerSource.next(selected?.message ?? snapshot);
							}
							if (selected?.peerError !== undefined) {
								peerSource.error(selected.peerError);
							}
							await selected?.settlement;
							if (selected?.error !== undefined) {
								throw selected.error;
							}
						},
						close,
					});
					connectorConnections.next(
						createConnection("connector", connectorIngress, acceptorIngress),
					);
					acceptorConnections.next(
						createConnection("acceptor", acceptorIngress, connectorIngress),
					);
					connectorConnections.complete();
				},
			};
		},
		openRawConnection() {
			nextConnectionId += 1;
			const connectionId = nextConnectionId;
			const ingress = new Subject<Uint8Array>();
			const responses: Readonly<Record<string, unknown>>[] = [];
			let closed = false;
			acceptorConnections.next({
				message$: ingress.asObservable(),
				async send(message) {
					const snapshot = message.slice();
					const value = JSON.parse(decoder.decode(snapshot)) as Readonly<
						Record<string, unknown>
					>;
					records.push({ connectionId, direction: "acceptor", value });
					responses.push(value);
				},
				async close() {
					if (!closed) {
						closed = true;
						ingress.complete();
					}
				},
			});
			return {
				connectionId,
				responses,
				send(record) {
					const message = new TextEncoder().encode(JSON.stringify(record));
					records.push({
						connectionId,
						direction: "connector",
						value: record,
					});
					ingress.next(message);
				},
			};
		},
		disconnect(connectionId) {
			const link = links.get(connectionId);
			link?.connectorIngress.complete();
			link?.acceptorIngress.complete();
		},
		disconnectSide(connectionId, side) {
			const link = links.get(connectionId);
			if (side === "connector") {
				link?.connectorIngress.complete();
			} else {
				link?.acceptorIngress.complete();
			}
		},
		emit(connectionId, target, record) {
			const link = links.get(connectionId);
			const message = encoder.encode(JSON.stringify(record));
			if (target === "connector") {
				link?.connectorIngress.next(message);
			} else {
				link?.acceptorIngress.next(message);
			}
		},
		directCloseCount(connectionId) {
			return directCloseCounts.get(connectionId) ?? 0;
		},
	};
}

describe("Default RPC Protocol", () => {
	it("RPC-SHUTDOWN-003 RPC-SHUTDOWN-005 drains queued post-G ingress through resource rejection before Close", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.shutdown-ingress.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		let rejectPhase = false;
		let handlerCalls = 0;
		const callEvents: string[] = [];
		connector.peer.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		connector.event$.subscribe((event) => {
			if (event.type === "call-started" || event.type === "call-finished") {
				callEvents.push(event.type);
			}
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				drop: rejectPhase && record.direction === "connector",
			})),
		});
		rejectPhase = true;
		network.emit(1, "connector", {
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "example.shutdown-ingress.v1",
				method: "add",
				args: [20, 22],
			},
		});

		const shutdown = connector.shutdown();
		expect(connector.state).toEqual({ status: "draining" });
		await vi.waitFor(() => {
			expect(
				network.records.some((record) => {
					const message = record.value.message as
						| Readonly<Record<string, unknown>>
						| undefined;
					const error = message?.error as
						| Readonly<Record<string, unknown>>
						| undefined;
					return (
						record.direction === "connector" &&
						message?.kind === "error" &&
						error?.code === "unavailable"
					);
				}),
			).toBe(true);
		});
		network.emit(1, "connector", { kind: "ack", ackThrough: 1 });
		await shutdown;

		expect(handlerCalls).toBe(0);
		expect(callEvents).toEqual([]);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		expect(network.directCloseCount(1)).toBe(1);
		await acceptor.close();
	});

	it("RPC-SHUTDOWN-005 waits for bidirectional calls, queued work, replay, ACK, and send idle", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.shutdown-predicate.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		let releaseFirstSend!: () => void;
		const firstSend = new Promise<void>((resolve) => {
			releaseFirstSend = resolve;
		});
		let blockFirstCall = true;
		const acceptorResolvers = new Map<number, (value: number) => void>();
		let resolveConnectorHandler!: (value: number) => void;
		let connectorHandlerCalls = 0;
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		acceptor.expose(descriptor, {
			add(left) {
				return new Promise<number>((resolve) => {
					acceptorResolvers.set(left, resolve);
				});
			},
		});
		connector.peer.expose(descriptor, {
			add() {
				connectorHandlerCalls += 1;
				return new Promise<number>((resolve) => {
					resolveConnectorHandler = resolve;
				});
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => {
				const message = record.value.message as
					| Readonly<Record<string, unknown>>
					| undefined;
				if (
					blockFirstCall &&
					record.direction === "connector" &&
					message?.kind === "call"
				) {
					blockFirstCall = false;
					return { settlement: firstSend };
				}
				return {};
			}, "silent"),
		});
		const acceptorPeer = acceptor.peers[0];
		if (acceptorPeer === undefined) {
			throw new Error("Expected a connected peer.");
		}
		const connectorService = connector.peer.resolve(descriptor);
		const first = connectorService.add(1, 1);
		void first.catch(() => {});
		await vi.waitFor(() => expect(acceptorResolvers.has(1)).toBe(true));
		const queued = connectorService.add(2, 2);
		void queued.catch(() => {});
		const incoming = acceptorPeer.resolve(descriptor).add(3, 3);
		void incoming.catch(() => {});
		await vi.waitFor(() => expect(connectorHandlerCalls).toBe(1));

		let shutdownSettled = false;
		const shutdown = connector.shutdown().then(() => {
			shutdownSettled = true;
		});
		expect(connector.state).toEqual({ status: "draining" });
		expect(shutdownSettled).toBe(false);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toEqual([]);

		acceptorResolvers.get(1)?.(2);
		resolveConnectorHandler(6);
		await expect(first).resolves.toBe(2);
		await Promise.resolve();
		expect(shutdownSettled).toBe(false);
		expect(acceptorResolvers.has(2)).toBe(false);

		releaseFirstSend();
		await vi.waitFor(() => expect(acceptorResolvers.has(2)).toBe(true));
		acceptorResolvers.get(2)?.(4);
		await expect(queued).resolves.toBe(4);
		await expect(incoming).resolves.toBe(6);
		await shutdown;

		expect(shutdownSettled).toBe(true);
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		await acceptor.close();
	});

	it("RPC-SHUTDOWN-004 RPC-SHUTDOWN-008 forces only the draining peer whose binding is lost", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.shutdown-binding-loss.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connectors = [createRpcConnector(), createRpcConnector()] as const;
		let handlerCalls = 0;
		for (const connector of connectors) {
			connector.peer.expose(descriptor, {
				add() {
					handlerCalls += 1;
					return new Promise<number>(() => {});
				},
			});
		}
		const events: string[] = [];
		acceptor.event$.subscribe((event) => events.push(event.type));

		await acceptor.listen(network.acceptorAdapter);
		for (const connector of connectors) {
			await connector.connect({ adapter: network.createConnectorAdapter() });
		}
		const firstPeer = acceptor.peers[0];
		const secondPeer = acceptor.peers[1];
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two connected peers.");
		}
		const firstCall = firstPeer.resolve(descriptor).add(1, 2);
		const secondCall = secondPeer.resolve(descriptor).add(3, 4);
		void firstCall.catch(() => {});
		void secondCall.catch(() => {});
		await vi.waitFor(() => expect(handlerCalls).toBe(2));

		const shutdown = acceptor.shutdown();
		expect(firstPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(secondPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		network.disconnect(1);

		await expect(firstCall).rejects.toMatchObject({ code: "outcome-unknown" });
		expect(firstPeer.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(acceptor.peers).toEqual([secondPeer]);
		expect(secondPeer.state).toEqual({
			status: "draining",
			reason: "graceful-shutdown",
		});
		expect(events).not.toContain("peer-recovering");

		expect(acceptor.close()).toBe(shutdown);
		await shutdown;
		await expect(secondCall).rejects.toMatchObject({ code: "outcome-unknown" });
		await Promise.all(connectors.map((connector) => connector.close()));
	});

	it.each([
		"fulfilled",
		"rejected",
		"terminal",
	] as const)("RPC-SHUTDOWN-006 RPC-SHUTDOWN-007 sends one egress Close shell when the send is %s", async (outcome) => {
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => {
				if (record.direction !== "connector" || record.value.kind !== "close") {
					return {};
				}
				if (outcome === "rejected") {
					return {
						drop: true,
						error: new Error("Close send rejected."),
					};
				}
				if (outcome === "terminal") {
					network.disconnectSide(record.connectionId, "connector");
					return { drop: true };
				}
				return {};
			}, "silent"),
		});

		await connector.shutdown();

		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);
		expect(network.directCloseCount(1)).toBe(1);
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: outcome === "terminal" ? "forced-close" : "graceful-shutdown",
		});
		await acceptor.close();
	});

	it("RPC-SHUTDOWN-009 applies Close only to the exact current binding and peer RPC-CORPUS-002", async () => {
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const firstConnector = createRpcConnector();
		const secondConnector = createRpcConnector();
		const closedPeers: unknown[] = [];
		const eventTypes: string[] = [];
		acceptor.event$.subscribe((event) => {
			eventTypes.push(event.type);
			if (event.type === "peer-closed") {
				closedPeers.push(event.peer);
			}
		});

		await acceptor.listen(network.acceptorAdapter);
		await firstConnector.connect({
			adapter: network.createConnectorAdapter(undefined, "silent"),
		});
		await secondConnector.connect({
			adapter: network.createConnectorAdapter(undefined, "silent"),
		});
		const firstPeer = acceptor.peers[0];
		const secondPeer = acceptor.peers[1];
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two connected peers.");
		}

		network.disconnectSide(1, "connector");
		await vi.waitFor(() =>
			expect(firstConnector.peer.state.status).toBe("recovering"),
		);
		await firstConnector.connect({
			adapter: network.createConnectorAdapter(undefined, "silent"),
		});
		expect(firstPeer.state.status).toBe("connected");

		network.emit(1, "acceptor", { kind: "close" });
		await Promise.resolve();
		expect(firstPeer.state.status).toBe("connected");
		expect(acceptor.peers).toEqual([firstPeer, secondPeer]);
		expect(closedPeers).toEqual([]);

		const recordsBeforeExactClose = network.records.length;
		network.emit(3, "acceptor", { kind: "close" });
		await vi.waitFor(() => {
			expect(firstPeer.state).toEqual({
				status: "closed",
				outcome: "normal",
				reason: "remote-terminated",
			});
		});
		expect(acceptor.peers).toEqual([secondPeer]);
		expect(secondPeer.state.status).toBe("connected");
		expect(closedPeers).toEqual([firstPeer]);
		expect(eventTypes).not.toContain("peer-recovering");
		expect(network.directCloseCount(3)).toBe(1);
		expect(
			network.records
				.slice(recordsBeforeExactClose)
				.filter(
					(record) =>
						record.connectionId === 3 && record.direction === "acceptor",
				),
		).toEqual([]);

		await Promise.all([
			firstConnector.close(),
			secondConnector.close(),
			acceptor.close(),
		]);
	});

	it("RPC-CLOSE-001 RPC-CLOSE-002 drops unsent force-close intents and fences a late send", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.force-fence.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		let releaseFirstSend!: () => void;
		const firstSend = new Promise<void>((resolve) => {
			releaseFirstSend = resolve;
		});
		let firstCallSend = true;
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const events: string[] = [];
		connector.event$.subscribe((event) => events.push(event.type));
		acceptor.expose(descriptor, {
			add: () => new Promise<number>(() => {}),
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => {
				const message = record.value.message as
					| Readonly<Record<string, unknown>>
					| undefined;
				if (
					firstCallSend &&
					record.direction === "connector" &&
					message?.kind === "call"
				) {
					firstCallSend = false;
					return { settlement: firstSend };
				}
				return {};
			}, "silent"),
		});
		const service = connector.peer.resolve(descriptor);
		const admitted = service.add(1, 2);
		void admitted.catch(() => {});
		await vi.waitFor(() => expect(firstCallSend).toBe(false));
		const pending = service.add(3, 4);
		void pending.catch(() => {});
		network.emit(1, "connector", { kind: "ping" });
		await Promise.resolve();
		const recordsBeforeClose = network.records.length;

		await connector.close();
		await expect(admitted).rejects.toMatchObject({ code: "outcome-unknown" });
		await expect(pending).rejects.toMatchObject({ code: "unavailable" });
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		expect(network.directCloseCount(1)).toBe(1);
		expect(events).not.toContain("peer-recovering");
		expect(
			network.records
				.slice(recordsBeforeClose)
				.filter((record) =>
					["close", "pong"].includes(String(record.value.kind)),
				),
		).toEqual([]);

		releaseFirstSend();
		await Promise.resolve();
		await Promise.resolve();
		expect(network.records).toHaveLength(recordsBeforeClose);
		expect(connector.state).toEqual({
			status: "closed",
			outcome: "normal",
			reason: "forced-close",
		});
		await acceptor.close();
	});

	it("ORDER-003 exposes a package-private real-ledger counter exhaustion seam RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor({
			protocolFactory: createRpcCounterExhaustionProtocolAcceptorForTest,
		});
		const connector = createRpcConnector({
			protocolFactory: createRpcCounterExhaustionProtocolConnectorForTest,
		});
		acceptor.expose(descriptor, { add: (left, right) => left + right });

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		const call = connector.peer.resolve(descriptor).add(1, 2);
		void call.catch(() => {});
		await vi.waitFor(() => {
			expect(connector.peer.state).toEqual({
				status: "draining",
				reason: "counter-exhaustion",
			});
		});
		await Promise.all([connector.close(), acceptor.close()]);
		await expect(call).rejects.toMatchObject({ code: "unavailable" });
	});

	it("RPC-PKG-003 RPC-WIRE-001 RPC-ACK-001 RPC-ACK-003 performs one fresh unary call with directional ledgers RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
		acceptor.expose(descriptor, {
			add: (left, right) => left + right,
		});

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		await expect(connector.peer.resolve(descriptor).add(19, 23)).resolves.toBe(
			42,
		);

		await vi.waitFor(() => {
			expect(
				adapters.records.some(
					(record) =>
						record.direction === "connector" &&
						record.value.kind === "ack" &&
						record.value.ackThrough === 1,
				),
			).toBe(true);
		});
		const call = adapters.records.find(
			(record) =>
				record.direction === "connector" && record.value.kind === "message",
		)?.value;
		const result = adapters.records.find(
			(record) =>
				record.direction === "acceptor" && record.value.kind === "message",
		)?.value;

		expect(adapters.records[0]?.value).toMatchObject({
			kind: "fresh",
			profiles: ["husky-di-rpc/1"],
		});
		expect(
			adapters.records.find(
				(record) =>
					record.direction === "acceptor" && record.value.kind === "accept",
			)?.value,
		).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
		});
		expect(call).toMatchObject({
			kind: "message",
			seq: 1,
			message: {
				kind: "call",
				callId: "1",
				service: "example.calculator.v1",
				method: "add",
				args: [19, 23],
			},
		});
		expect(result).toMatchObject({
			kind: "message",
			seq: 1,
			ackThrough: 1,
			message: { kind: "result", callId: "1", value: 42 },
		});
		expect(adapters.maximumConcurrentSends).toEqual({
			connector: 1,
			acceptor: 1,
		});
	});

	it("RPC-SEC-002 issues an independent 256-bit bearer resume token in FreshAccept", async () => {
		const adapters = createMemoryAdapters();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();

		await acceptor.listen(adapters.acceptorAdapter);
		await connector.connect({ adapter: adapters.connectorAdapter });
		const freshRequest = adapters.records[0]?.value;
		const freshAccept = adapters.records.find(
			(record) =>
				record.direction === "acceptor" && record.value.kind === "accept",
		)?.value;

		expect(freshRequest).toEqual({
			kind: "fresh",
			profiles: ["husky-di-rpc/1"],
		});
		expect(freshAccept).toMatchObject({
			kind: "accept",
			profile: "husky-di-rpc/1",
			bindingEpoch: 1,
			sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			resumeToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
		});
		expect(freshAccept?.resumeToken).not.toBe(freshAccept?.sessionId);
		expect(
			adapters.records.filter((record) => "resumeToken" in record.value),
		).toHaveLength(1);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SEC-008 redacts a token-bearing FreshAccept Adapter failure at the public Connector boundary", async () => {
		const network = createRecoveryNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const decoder = new TextDecoder();
		let resumeToken: unknown;
		await acceptor.listen(network.acceptorAdapter);

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => {
					const isFreshAccept =
						record.direction === "acceptor" &&
						record.value.kind === "accept" &&
						!("receivedThrough" in record.value);
					if (!isFreshAccept) {
						return {};
					}
					resumeToken = record.value.resumeToken;
					return { peerError: new Error(decoder.decode(message)) };
				}),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);

		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		expect(failure).toMatchObject({ code: "unavailable" });
		expect(collectPublicErrorText(failure)).not.toContain(resumeToken);
		expect(connector.peer.state.status).toBe("unbound");
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-001 RPC-SESSION-005 RPC-SESSION-006 RPC-RECOVERY-004 RPC-ACK-007 RPC-LEDGER-002 RPC-CORPUS-003 resumes the retained Session and replays an unreceived call identity RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		const connectorPeer = connector.peer;

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				drop:
					record.direction === "connector" &&
					record.value.kind === "message" &&
					(record.value.message as { readonly kind?: string }).kind === "call",
			})),
		});
		const acceptorPeer = acceptor.peers[0];
		const call = connector.peer.resolve(descriptor).add(20, 22);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 1 &&
						record.direction === "connector" &&
						record.value.kind === "message",
				),
			).toBe(true);
		});

		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptor.peers[0]?.state.status).toBe("recovering");
		});
		await connector.connect({ adapter: network.createConnectorAdapter() });

		await expect(call).resolves.toBe(42);
		expect(connector.peer).toBe(connectorPeer);
		expect(acceptor.peers[0]).toBe(acceptorPeer);
		expect(handlerCalls).toBe(1);
		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "connector" &&
					record.value.kind === "resume",
			)?.value,
		).toMatchObject({
			kind: "resume",
			profile: "husky-di-rpc/1",
			resumeAttempt: 1,
			receivedThrough: 0,
		});
		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept",
			)?.value,
		).toMatchObject({
			kind: "accept",
			bindingEpoch: 2,
			receivedThrough: 0,
		});
		const replayedCalls = network.records.filter(
			(record) =>
				record.direction === "connector" &&
				record.value.kind === "message" &&
				(record.value.message as { readonly kind?: string }).kind === "call",
		);
		expect(replayedCalls).toHaveLength(2);
		expect(replayedCalls.map((record) => record.value.seq)).toEqual([1, 1]);
		expect(
			replayedCalls.map(
				(record) =>
					(record.value.message as { readonly callId: string }).callId,
			),
		).toEqual(["1", "1"]);
	});

	it("RPC-ACK-002 RPC-ACK-006 RPC-ACK-007 confirms durable receipt before handler completion and replay release RPC-VALID-002 RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(
			IDeferredCalculatorService,
			{
				wireName: "example.deferred-calculator.v1",
				methods: { add: true },
			},
		);
		const network = createRecoveryNetwork();
		let resolveHandler!: (value: number) => void;
		const handlerResult = new Promise<number>((resolve) => {
			resolveHandler = resolve;
		});
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1_000,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add() {
				handlerCalls += 1;
				return handlerResult;
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const call = connector.peer.resolve(descriptor).add(20, 22);
		await vi.waitFor(() => {
			expect(handlerCalls).toBe(1);
		});

		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptor.peers[0]?.state.status).toBe("recovering");
		});
		await connector.connect({ adapter: network.createConnectorAdapter() });

		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept",
			)?.value,
		).toMatchObject({ receivedThrough: 1 });
		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" &&
					record.value.kind === "message" &&
					(record.value.message as { readonly kind?: string }).kind === "call",
			),
		).toHaveLength(1);
		expect(handlerCalls).toBe(1);

		resolveHandler(42);
		await expect(call).resolves.toBe(42);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it.each([
		["lower", 0],
		["upper", 2],
	] as const)("RPC-SESSION-008 RPC-SEC-006 RPC-VALID-004 RPC-CORPUS-003 treats a token-authorized %s resume cursor as continuity-failure RPC-CORPUS-002", async (_position, receivedThrough) => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 1_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, { add: (left, right) => left + right });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		await expect(connector.peer.resolve(descriptor).add(1, 2)).resolves.toBe(3);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 1 &&
						record.direction === "connector" &&
						record.value.kind === "ack" &&
						record.value.ackThrough === 1,
				),
			).toBe(true);
		});
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		const request = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough,
			resumeAttempt: 1,
		};
		const raw = network.openRawConnection();

		raw.send(request);

		await vi.waitFor(() => {
			expect(raw.responses[0]).toEqual({
				kind: "reject",
				code: "continuity-failure",
			});
		});
		await vi.waitFor(() => {
			expect(acceptorPeer?.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "continuity-failure",
			});
			expect(connector.peer.state.status).toBe("recovering");
		});
	});

	it("RPC-SESSION-006 RPC-SESSION-007 RPC-RECOVERY-002 RPC-SEC-003 RPC-CORPUS-003 recovers a lost resume accept with the stable token and a higher attempt RPC-CORPUS-002", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, { add: (left, right) => left + right });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		const resumeToken = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value.resumeToken;
		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await expect(
			connector.connect({
				adapter: network.createConnectorAdapter((record) => ({
					drop:
						record.connectionId === 2 &&
						record.direction === "acceptor" &&
						record.value.kind === "accept",
				})),
			}),
		).rejects.toMatchObject({ code: "unavailable" });
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});

		await connector.connect({ adapter: network.createConnectorAdapter() });

		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		await expect(connector.peer.resolve(descriptor).add(40, 2)).resolves.toBe(
			42,
		);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeToken),
		).toEqual([resumeToken, resumeToken]);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "acceptor" &&
						record.value.kind === "accept" &&
						"receivedThrough" in record.value,
				)
				.map((record) => record.value.bindingEpoch),
		).toEqual([2, 3]);
	});

	it("RPC-RECOVERY-003 makes installed resume acceptance win the old recovery deadline", async () => {
		const network = createRecoveryNetwork();
		let releaseAccept!: () => void;
		const acceptSettlement = new Promise<void>((resolve) => {
			releaseAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 100,
			recoveryGraceMs: 150,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 100));

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? acceptSettlement
						: undefined,
			})),
		});
		await new Promise<void>((resolve) => setTimeout(resolve, 70));

		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("recovering");
		releaseAccept();
		await vi.waitFor(() => {
			expect(acceptorPeer?.state.status).toBe("connected");
		});
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-RECOVERY-002 restarts retention when an installed binding attempt times out", async () => {
		vi.useFakeTimers();
		const network = createRecoveryNetwork();
		let releaseTimedOutAccept!: () => void;
		const timedOutAccept = new Promise<void>((resolve) => {
			releaseTimedOutAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 300,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? timedOutAccept
						: undefined,
			})),
		});
		await vi.advanceTimersByTimeAsync(50);
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		releaseTimedOutAccept();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-007 RPC-SESSION-009 RPC-CORPUS-003 lets a higher resume fence an installed accept still in flight", async () => {
		const network = createRecoveryNetwork();
		let releaseFirstAccept!: () => void;
		const firstAccept = new Promise<void>((resolve) => {
			releaseFirstAccept = resolve;
		});
		const policy = {
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await connector.connect({
			adapter: network.createConnectorAdapter((record) => ({
				settlement:
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "accept" &&
					"receivedThrough" in record.value
						? firstAccept
						: undefined,
			})),
		});
		const higherRequest = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough: 0,
			resumeAttempt: 2,
		};
		const raw = network.openRawConnection();

		raw.send(higherRequest);
		await vi.waitFor(() => {
			expect(raw.responses[0]).toMatchObject({
				kind: "accept",
				bindingEpoch: 3,
			});
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("connected");
		});
		releaseFirstAccept();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("connected");
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-007 RPC-RECOVERY-005 RPC-SEC-007 RPC-CORPUS-003 fences an old binding while its initiator and send completion are late", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const network = createRecoveryNetwork();
		let releaseLateSend!: () => void;
		const lateSend = new Promise<void>((resolve) => {
			releaseLateSend = resolve;
		});
		let handlerCalls = 0;
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		acceptor.expose(descriptor, {
			add(left, right) {
				handlerCalls += 1;
				return left + right;
			},
		});
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({
			adapter: network.createConnectorAdapter(
				(record) => ({
					settlement:
						record.direction === "connector" &&
						record.value.kind === "message" &&
						(record.value.message as { readonly kind?: string }).kind === "call"
							? lateSend
							: undefined,
				}),
				"silent",
			),
		});
		const acceptorPeer = acceptor.peers[0];
		const freshAccept = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value;
		if (freshAccept === undefined) {
			throw new Error("Expected a captured fresh accept.");
		}
		const rawRequest = {
			kind: "resume",
			profile: "husky-di-rpc/1",
			sessionId: freshAccept.sessionId as string,
			resumeToken: freshAccept.resumeToken as string,
			receivedThrough: 0,
			resumeAttempt: 1,
		};
		const raw = network.openRawConnection();

		raw.send(rawRequest);
		await vi.waitFor(() => {
			expect(raw.responses[0]).toMatchObject({
				kind: "accept",
				bindingEpoch: 2,
			});
		});
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");

		const call = connector.peer.resolve(descriptor).add(21, 21);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 1 &&
						record.direction === "connector" &&
						record.value.kind === "message",
				),
			).toBe(true);
		});
		expect(handlerCalls).toBe(0);
		network.disconnectSide(1, "connector");
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});

		await expect(
			connector.connect({ adapter: network.createConnectorAdapter() }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(acceptorPeer?.state.status).toBe("connected");
		await connector.connect({ adapter: network.createConnectorAdapter() });

		await expect(call).resolves.toBe(42);
		expect(handlerCalls).toBe(1);
		expect(acceptor.peers[0]).toBe(acceptorPeer);
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "acceptor" &&
						record.value.kind === "accept" &&
						"receivedThrough" in record.value,
				)
				.map((record) => record.value.bindingEpoch),
		).toEqual([2, 3]);
		for (const record of network.records.filter(
			(record) =>
				record.value.kind === "message" ||
				record.value.kind === "ack" ||
				record.value.kind === "ping" ||
				record.value.kind === "pong" ||
				record.value.kind === "close",
		)) {
			expect(record.value).not.toHaveProperty("authTag");
		}
		releaseLateSend();
		await Promise.resolve();
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
	});

	it.each([
		"profile",
		"session",
		"token",
	] as const)("RPC-SEC-005 RPC-SEC-008 RPC-RECOVERY-006 keeps a %s mismatch generic, redacted, and non-authoritative RPC-CORPUS-002", async (mismatch) => {
		const network = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 500,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const acceptorPeer = acceptor.peers[0];
		const resumeToken = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value.resumeToken;
		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
			expect(acceptorPeer?.state.status).toBe("recovering");
		});
		const replacementSessionId = createRpcSecurityCarrier();
		const replacementResumeToken = createRpcSecurityCarrier();
		const decoder = new TextDecoder();
		const encoder = new TextEncoder();

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => {
					if (
						record.direction !== "connector" ||
						record.value.kind !== "resume"
					) {
						return {};
					}
					const value = JSON.parse(decoder.decode(message)) as Record<
						string,
						unknown
					>;
					if (mismatch === "profile") {
						value.profile = "husky-di-rpc/2";
					} else if (mismatch === "session") {
						value.sessionId = replacementSessionId;
					} else {
						value.resumeToken = replacementResumeToken;
					}
					return { message: encoder.encode(JSON.stringify(value)) };
				}),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);
		expect(failure).toMatchObject({ code: "unavailable" });
		expect(String(failure)).not.toContain(resumeToken);
		expect(String(failure)).not.toContain(replacementResumeToken);
		expect(JSON.stringify(connector.peer.state)).not.toContain(resumeToken);
		expect(JSON.stringify(acceptorPeer?.state)).not.toContain(resumeToken);

		expect(
			network.records.find(
				(record) =>
					record.connectionId === 2 &&
					record.direction === "acceptor" &&
					record.value.kind === "reject",
			)?.value,
		).toEqual({ kind: "reject", code: "resume-rejected" });
		expect(connector.peer.state.status).toBe("recovering");
		expect(acceptorPeer?.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(acceptorPeer?.state.status).toBe("connected");
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
	});

	it("RPC-SEC-008 redacts a token-bearing ResumeRequest Adapter failure at the public Connector boundary", async () => {
		const network = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 500,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const resumeToken = network.records.find(
			(record) =>
				record.connectionId === 1 &&
				record.direction === "acceptor" &&
				record.value.kind === "accept",
		)?.value.resumeToken;
		if (typeof resumeToken !== "string") {
			throw new Error("Expected a captured resume token.");
		}
		network.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});
		const decoder = new TextDecoder();

		const failure = await connector
			.connect({
				adapter: network.createConnectorAdapter((record, message) => ({
					drop:
						record.direction === "connector" && record.value.kind === "resume",
					error:
						record.direction === "connector" && record.value.kind === "resume"
							? new Error(decoder.decode(message))
							: undefined,
				})),
			})
			.then(
				() => undefined,
				(error: unknown) => error,
			);

		expect(failure).toMatchObject({ code: "unavailable" });
		expect(collectPublicErrorText(failure)).not.toContain(resumeToken);
		expect(connector.peer.state.status).toBe("recovering");

		await connector.connect({ adapter: network.createConnectorAdapter() });
		expect(connector.peer.state.status).toBe("connected");
		expect(
			network.records
				.filter(
					(record) =>
						record.direction === "connector" && record.value.kind === "resume",
				)
				.map((record) => record.value.resumeAttempt),
		).toEqual([1, 2]);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SESSION-001 RPC-RECOVERY-003 RPC-RECOVERY-006 RPC-CORPUS-003 expires retained authority after token loss without sliding the deadline", async () => {
		const descriptor = createRemoteServiceDescriptor(ICalculatorService, {
			wireName: "example.calculator.v1",
			methods: { add: true },
		});
		const originalNetwork = createRecoveryNetwork();
		const restartedNetwork = createRecoveryNetwork();
		const policy = {
			bindingAttemptTimeoutMs: 50,
			recoveryGraceMs: 300,
		};
		const originalAcceptor = createRpcAcceptor({ runtimePolicy: policy });
		const restartedAcceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		originalAcceptor.expose(descriptor, {
			add: (left, right) => left + right,
		});

		await originalAcceptor.listen(originalNetwork.acceptorAdapter);
		await connector.connect({
			adapter: originalNetwork.createConnectorAdapter(),
		});
		originalNetwork.disconnect(1);
		await vi.waitFor(() => {
			expect(connector.peer.state.status).toBe("recovering");
		});
		const recoveryStarted = Date.now();
		const pending = connector.peer.resolve(descriptor).add(20, 22);
		void pending.catch(() => {});
		await new Promise<void>((resolve) => setTimeout(resolve, 200));

		await restartedAcceptor.listen(restartedNetwork.acceptorAdapter);
		await expect(
			connector.connect({ adapter: restartedNetwork.createConnectorAdapter() }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(
			restartedNetwork.records.find(
				(record) =>
					record.direction === "acceptor" && record.value.kind === "reject",
			)?.value,
		).toMatchObject({ kind: "reject", code: "resume-rejected" });
		expect(connector.peer.state.status).toBe("recovering");
		expect(restartedAcceptor.peers).toHaveLength(0);

		await vi.waitFor(() => {
			expect(connector.peer.state).toMatchObject({
				status: "closed",
				outcome: "failed",
				reason: "recovery-expired",
			});
		});
		expect(Date.now() - recoveryStarted).toBeLessThan(400);
		await expect(pending).rejects.toMatchObject({ code: "unavailable" });
		await Promise.all([
			connector.close(),
			originalAcceptor.close(),
			restartedAcceptor.close(),
		]);
	});
});
