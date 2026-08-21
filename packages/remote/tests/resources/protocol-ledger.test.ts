/**
 * @overview Default Protocol retained ledger, replay, and deduplication bounds.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it, vi } from "vitest";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCodecImpl } from "../../src/impls/protocol/rpc-codec.impl";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
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
		const endpoint = harness.installReplacement();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(4));

		session.receive(endpoint, codec.encode({ kind: "ack", ackThrough: 3 }));
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
			methods: { run: true },
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

	it("RPC-LEDGER-003 RPC-LEDGER-005 RPC-VALID-006 rejects capacity before route lookup at 256 unacknowledged incoming ledgers RPC-CORPUS-004", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.ledger.v1",
			methods: { run: true },
		});
		const unknownDescriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.unknown-ledger.v1",
			methods: { run: true },
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
			methods: { run: true },
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
			methods: { run: true },
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
