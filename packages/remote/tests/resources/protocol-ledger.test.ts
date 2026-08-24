/**
 * @overview Default Protocol retained ledger, replay, and deduplication bounds.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it, vi } from "vitest";
import { RpcCallTerminalTypeEnum } from "../../src/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "../../src/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCallDirectionEnum } from "../../src/enums/rpc-call-direction.enum";
import { RpcEventTypeEnum } from "../../src/enums/rpc-event-type.enum";
import { createRpcProtocol } from "../../src/factories/rpc-protocol.factory";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import type { RpcRetainedBytesLedgerImpl } from "../../src/impls/protocol/rpc-retained-bytes-ledger.impl";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import type {
	IRpcProtocol,
	IRpcProtocolHost,
} from "../../src/interfaces/protocol/rpc-protocol.interface";
import { normalizeRpcApplicationArguments } from "../../src/utils/rpc-application-value.util";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "../protocol/test.utils";

interface ILedgerService {
	run(value: number): number;
}

const codec = new RpcCodecImpl();

interface ILargeLedgerService {
	run(): string;
}

const ILedgerService =
	createServiceIdentifier<ILedgerService>("ILedgerService");
const ILargeLedgerService = createServiceIdentifier<ILargeLedgerService>(
	"ILargeLedgerService",
);

describe("Default RPC Protocol retained ledger", () => {
	it("RPC-CALL-005 RPC-RESOURCE-003 guards replay-rejected payload through reentrant terminal cleanup", async () => {
		const harness = createRpcDirectSessionHarness({
			maxPendingInvocationsPerSession: 1,
		});
		const { session } = harness;
		for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
			const reservation = session.reserveInvocation({
				service: "example.replay-guard.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([ordinal]),
			});
			if (reservation === undefined) {
				throw new Error("Expected replay-filling Invocation capacity.");
			}
			const invocation = reservation.commit({ finish() {} });
			invocation.start();
			await vi.waitFor(() => expect(harness.sent).toHaveLength(ordinal));
			session._receiveResult({
				kind: RpcWireRecordKindEnum.result,
				callId: String(ordinal),
			});
		}

		const args = normalizeRpcApplicationArguments(["retained"]);
		const pendingCharge = args.weight + 256;
		const retainedBeforePending = (
			session._retainedBytesLedger as RpcRetainedBytesLedgerImpl
		)._retainedBytes;
		const occupied = session.reserveRetainedBytes(
			session._host.policy.maxRetainedBytesPerSession -
				retainedBeforePending -
				pendingCharge,
		);
		if (occupied === undefined) {
			throw new Error("Expected capacity beside the replay-filled Session.");
		}
		const reservation = session.reserveInvocation({
			service: "example.replay-guard.v1",
			method: "run",
			args,
		});
		if (reservation === undefined) {
			throw new Error("Expected the final Pending Invocation capacity.");
		}
		let reentrantOwnerReservation:
			| ReturnType<typeof session._host.reserveRetainedBytes>
			| undefined;
		const invocation = reservation.commit({
			finish: () => {
				session.forceClose();
				reentrantOwnerReservation = session._host.reserveRetainedBytes(
					retainedBeforePending + 1,
				);
			},
		});

		invocation.start();

		expect(reentrantOwnerReservation).toBeUndefined();
		const afterTerminal = session._host.reserveRetainedBytes(
			retainedBeforePending + 1,
		);
		expect(afterTerminal).toBeDefined();
		afterTerminal?.release();
		occupied.release();
	});

	it("RPC-CALL-008 RPC-RESOURCE-003 releases committed incoming storage when reentrant Owner close wins", async () => {
		const maximumBytes = 4 * 1024 * 1024;
		const builtIn = createRpcProtocol();
		let capturedHost: IRpcProtocolHost | undefined;
		const protocol = Object.freeze<IRpcProtocol>({
			createAcceptor: (host) => {
				capturedHost = host;
				return builtIn.createAcceptor(host);
			},
			createConnector: (host) => builtIn.createConnector(host),
		});
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.reentrant-incoming-ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const handler = vi.fn((value: number) => value);
		const acceptor = createRpcAcceptor({
			protocol,
			runtimePolicy: {
				maxSessions: 1,
				maxHandshakes: 1,
				maxRetainedBytesPerSession: maximumBytes,
				maxRetainedBytesTotal: maximumBytes,
			},
		});
		const connector = createRpcConnector({
			runtimePolicy: { maxRetainedBytesPerSession: maximumBytes },
		});
		acceptor.expose(descriptor, { run: handler });
		let closeTask: Promise<void> | undefined;
		const eventSubscription = acceptor.event$.subscribe((event) => {
			if (
				event.type === RpcEventTypeEnum.callStarted &&
				event.direction === RpcCallDirectionEnum.incoming
			) {
				closeTask ??= acceptor.close();
			}
		});

		try {
			await acceptor.listen(network.acceptorAdapter);
			await connector.connect({ adapter: network.createConnectorAdapter() });
			void connector.peer
				.resolve(descriptor)
				.run(1)
				.catch(() => {});
			await vi.waitFor(() => expect(closeTask).toBeDefined());
			await closeTask;
			await Promise.resolve();
			await Promise.resolve();

			expect(handler).not.toHaveBeenCalled();
			if (capturedHost === undefined) {
				throw new Error("Expected the Acceptor Protocol host to be captured.");
			}
			const replacement = capturedHost.reserveRetainedBytes(maximumBytes);
			expect(replacement).toBeDefined();
			replacement?.release();
		} finally {
			eventSubscription.unsubscribe();
			await Promise.allSettled([connector.close(), acceptor.close()]);
		}
	});

	it("RPC-LEDGER-005 RPC-RESOURCE-003 releases an admitted outgoing request payload from the call ledger", async () => {
		const harness = createRpcDirectSessionHarness();
		const reservation = harness.session.reserveInvocation({
			service: "example.outgoing-ledger.v1",
			method: "run",
			args: normalizeRpcApplicationArguments(["x".repeat(512 * 1024)]),
		});
		if (reservation === undefined) {
			throw new Error("Expected outgoing Invocation capacity.");
		}
		const invocation = reservation.commit({ finish() {} });

		invocation.start();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));

		const entry = harness.session._outgoingCalls.get("1");
		expect(entry).toBeDefined();
		expect(entry?.request).toBeUndefined();
		expect(harness.session._replay.has(1)).toBe(true);
		harness.receive(
			codec.encode({ kind: RpcWireRecordKindEnum.ack, ackThrough: 1 }),
		);
		expect(harness.session._replay.has(1)).toBe(false);
		expect(harness.session._outgoingCalls.get("1")).toBe(entry);
		expect(entry?.request).toBeUndefined();

		harness.session.forceClose();
	});

	it("RPC-LEDGER-005 retains terminal identity without the finished Framework call handle", async () => {
		const harness = createRpcDirectSessionHarness();
		const finishes: unknown[] = [];
		harness.session._sessionHost = {
			reserveIncomingCall: () => ({
				kind: RpcIncomingCallKindEnum.handler,
				reservation: {
					commit: () => ({
						handlerOutcome: Promise.resolve({
							type: RpcCallTerminalTypeEnum.returnedVoid,
						}),
						finish: (outcome) => finishes.push(outcome),
					}),
					release() {},
				},
			}),
			transition() {},
			fault() {},
		};

		harness.session._receiveCall({
			kind: RpcWireRecordKindEnum.call,
			callId: "1",
			service: "example.finished-call.v1",
			method: "run",
			args: [1],
		});
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));

		const entry = harness.session._incomingCalls.get("1");
		expect(entry).toMatchObject({
			callId: "1",
			terminalSelected: true,
			terminalSequence: 1,
			call: undefined,
		});
		expect(entry).not.toHaveProperty("handlerCall");
		expect(finishes).toEqual([{ type: RpcCallTerminalTypeEnum.returnedVoid }]);
		harness.session.forceClose();
	});

	it("RPC-ACK-007 removes newly acknowledged entries from an in-progress replay barrier", async () => {
		const harness = createRpcDirectSessionHarness();
		const { session } = harness;
		for (let ordinal = 1; ordinal <= 3; ordinal += 1) {
			session._queueSemantic({
				kind: RpcWireRecordKindEnum.cancel,
				callId: String(ordinal),
			});
		}
		await vi.waitFor(() => expect(harness.sent).toHaveLength(3));
		await Promise.resolve();
		session._enterRecovery();
		let releaseReplay!: () => void;
		const blockedReplay = new Promise<void>((resolve) => {
			releaseReplay = resolve;
		});
		harness.setSendSettlement(blockedReplay);
		harness.installReplacement();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(4));

		harness.receive(codec.encode({ kind: "ack", ackThrough: 3 }));
		releaseReplay();
		await Promise.resolve();
		await Promise.resolve();

		expect(session._replayBarrier).toEqual([]);
		expect(harness.faults).toEqual([]);

		session.forceClose();
	});

	it("RPC-ACK-005 RPC-LEDGER-005 releases payload fingerprints after terminal ACK GC without redispatch", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
		let dispatches = 0;
		acceptor.expose(descriptor, {
			run: (value) => {
				dispatches += 1;
				return value;
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		await expect(connector.peer.resolve(descriptor).run(1)).resolves.toBe(1);
		await vi.waitFor(() => {
			expect(
				network.records.some(
					(record) =>
						record.direction === "connector" &&
						record.value.kind === "ack" &&
						record.value.ackThrough === 1,
				),
			).toBe(true);
		});

		network.emit(
			1,
			"acceptor",
			new TextEncoder().encode(
				JSON.stringify({
					kind: "message",
					seq: 1,
					message: {
						kind: "call",
						callId: "1",
						service: "example.ledger.v1",
						method: "run",
						args: [2],
					},
				}),
			),
		);
		await new Promise<void>((resolve) => setTimeout(resolve, 5));

		expect(dispatches).toBe(1);
		expect(acceptor.peers[0]?.state).toEqual({ status: "connected" });

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-LEDGER-003 RPC-VALUE-004 validates call arguments before draining capacity rejection", () => {
		const harness = createRpcDirectSessionHarness();
		harness.session._draining = true;

		expect(() =>
			harness.session._receiveCall({
				kind: RpcWireRecordKindEnum.call,
				callId: "1",
				service: "example.invalid-capacity.v1",
				method: "run",
				args: ["x".repeat(524_289)],
			}),
		).toThrow(TypeError);
		expect(harness.session._highestIncomingCallOrdinal).toBe(0);
		expect(harness.sent).toEqual([]);
		harness.session.forceClose();
	});

	it("RPC-LEDGER-003 RPC-LEDGER-005 RPC-VALID-006 rejects capacity before route lookup at 256 unacknowledged incoming ledgers RPC-CORPUS-004", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const unknownDescriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.unknown-ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const acceptor = createRpcAcceptor({ runtimePolicy: { ackDelayMs: 1 } });
		const connector = createRpcConnector({ runtimePolicy: { ackDelayMs: 1 } });
		const encoder = new TextEncoder();
		let dispatches = 0;
		acceptor.expose(descriptor, {
			run: (value) => {
				dispatches += 1;
				return value;
			},
		});
		network.setInterceptor((record) => {
			if (record.direction !== "connector") {
				return undefined;
			}
			if (record.value.kind === "ack") {
				return { drop: true };
			}
			if (record.value.kind === "message" && "ackThrough" in record.value) {
				const { ackThrough: _ackThrough, ...withoutAck } = record.value;
				return { message: encoder.encode(JSON.stringify(withoutAck)) };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const service = connector.peer.resolve(descriptor);
		for (let value = 0; value < 256; value += 1) {
			await expect(service.run(value)).resolves.toBe(value);
		}

		await expect(
			connector.peer.resolve(unknownDescriptor).run(256),
		).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(dispatches).toBe(256);

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-LEDGER-004 RPC-RESOURCE-001 RPC-RESOURCE-002 RPC-POLICY-002 uses the protected terminal reserve when the ordinary replay-entry cap is full", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const policy = {
			ackDelayMs: 1,
			maxPendingInvocationsPerSession: 1,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		const encoder = new TextEncoder();
		acceptor.expose(descriptor, { run: (value) => value });
		network.setInterceptor((record) => {
			if (record.direction !== "connector") {
				return undefined;
			}
			if (record.value.kind === "ack") {
				return { drop: true };
			}
			if (record.value.kind === "message" && "ackThrough" in record.value) {
				const { ackThrough: _ackThrough, ...withoutAck } = record.value;
				return { message: encoder.encode(JSON.stringify(withoutAck)) };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const service = connector.peer.resolve(descriptor);
		for (let value = 0; value < 4; value += 1) {
			await expect(service.run(value)).resolves.toBe(value);
		}
		await expect(service.run(4)).rejects.toMatchObject({
			code: "handler-failed",
		});
		expect(acceptor.peers[0]?.state).toEqual({ status: "connected" });

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-ACK-004 RPC-LEDGER-004 RPC-RESOURCE-001 RPC-RESOURCE-002 selects exactly one protected handler-failed terminal when ordinary replay bytes are full", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILargeLedgerService, {
			wireName: "example.large-ledger.v1",
			members: { run: { kind: "unary" } },
		});
		const policy = {
			ackDelayMs: 1,
			maxRetainedBytesPerSession: 8 * 1024 * 1024,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		const encoder = new TextEncoder();
		const payload = "x".repeat(524_288);
		acceptor.expose(descriptor, { run: () => payload });
		network.setInterceptor((record) => {
			if (record.direction !== "connector") {
				return undefined;
			}
			if (record.value.kind === "ack") {
				return { drop: true };
			}
			if (record.value.kind === "message" && "ackThrough" in record.value) {
				const { ackThrough: _ackThrough, ...withoutAck } = record.value;
				return { message: encoder.encode(JSON.stringify(withoutAck)) };
			}
			return undefined;
		});

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const service = connector.peer.resolve(descriptor);
		for (let ordinal = 0; ordinal < 3; ordinal += 1) {
			await expect(service.run()).resolves.toBe(payload);
		}
		await expect(service.run()).rejects.toMatchObject({
			code: "handler-failed",
		});
		expect(acceptor.peers[0]?.state).toEqual({ status: "connected" });
		const fourthTerminals = network.records.filter((record) => {
			const message = record.value.message;
			if (
				record.direction !== "acceptor" ||
				record.value.kind !== "message" ||
				typeof message !== "object" ||
				message === null ||
				!("kind" in message) ||
				!("callId" in message) ||
				message.kind !== "error" ||
				message.callId !== "4"
			) {
				return false;
			}
			const error = "error" in message ? message.error : undefined;
			return (
				typeof error === "object" &&
				error !== null &&
				"code" in error &&
				error.code === "handler-failed"
			);
		});
		expect(fourthTerminals).toHaveLength(1);

		await Promise.all([connector.close(), acceptor.close()]);
	});
});
