/**
 * @overview Verifies protocol ledger.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { RpcCallDirectionEnum } from "../../src/modules/peer";
import type { IRpcProtocolHost } from "../../src/modules/protocol";
import {
	createRpcProtocolAcceptor,
	normalizeRpcApplicationArguments,
	RPC_PROTECTED_SESSION_BYTES,
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
	type RpcSessionContinuityImpl,
	RpcWireRecordKindEnum,
} from "../../src/modules/protocol";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import type { RpcRetainedBytesLedgerImpl } from "../../src/shared/impls/rpc-retained-bytes-ledger.impl";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "../protocol/test.utils";
import { codec, ILedgerService } from "./ledger/test.utils";

describe("Default RPC Protocol retained ledger", () => {
	it("RPC-CALL-005 RPC-RESOURCE-003 guards replay-rejected payload through reentrant terminal cleanup", async () => {
		const harness = createRpcDirectSessionHarness({
			maxPendingInvocationsPerSession: 1,
		});
		const { session } = harness;
		for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
			const invocation = session.prepareInvocation(
				{
					service: "example.replay-guard.v1",
					method: "run",
					args: normalizeRpcApplicationArguments([ordinal]),
				},
				() => undefined,
			);
			if (invocation === undefined) {
				throw new Error("Expected replay-filling Invocation capacity.");
			}
			invocation.start();
			await vi.waitFor(() => expect(harness.sent).toHaveLength(ordinal));
			harness.receive(
				codec.encode({
					kind: RpcWireRecordKindEnum.message,
					seq: ordinal,
					message: {
						kind: RpcWireRecordKindEnum.result,
						callId: String(ordinal),
					},
				}),
			);
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
		let reentrantOwnerReservation:
			| ReturnType<typeof session._host.reserveRetainedBytes>
			| undefined;
		const invocation = session.prepareInvocation(
			{ service: "example.replay-guard.v1", method: "run", args },
			() => {
				session.forceClose();
				reentrantOwnerReservation = session._host.reserveRetainedBytes(
					retainedBeforePending + 1,
				);
			},
		);
		if (invocation === undefined) {
			throw new Error("Expected the final Pending Invocation capacity.");
		}

		invocation.start();

		expect(reentrantOwnerReservation).toBeUndefined();
		const afterTerminal = session._host.reserveRetainedBytes(
			retainedBeforePending + 1,
		);
		expect(afterTerminal).toBeDefined();
		afterTerminal?.release();
		occupied.release();
	});

	it.each([
		false,
		true,
	])("RPC-CALL-005 RPC-RESOURCE-003 guards encode-rejected payload through finish with reentrant close=%s", async (closeDuringFinish) => {
		const { session, sent, faults } = createRpcDirectSessionHarness();
		const maximumBytes = session._host.policy.maxRetainedBytesTotal;
		const request = {
			service: "example.encode-guard.v1",
			method: "run",
			args: normalizeRpcApplicationArguments(["x".repeat(1024)]),
		};
		let rejectNextEnvelope = true;
		const rejectedEnvelopes: unknown[] = [];
		const encode = session._codec.encode.bind(session._codec);
		const encodeSpy = vi
			.spyOn(session._codec, "encode")
			.mockImplementation((record) => {
				// Replay capacity sizing succeeds; only the actual admission envelope fails.
				if (
					rejectNextEnvelope &&
					record.kind === RpcWireRecordKindEnum.message &&
					record.seq !== Number.MAX_SAFE_INTEGER
				) {
					rejectNextEnvelope = false;
					rejectedEnvelopes.push(record);
					throw new Error("Expected admission envelope encoding failure.");
				}
				return encode(record);
			});
		let reentrantOwnerReservation:
			| ReturnType<typeof session._host.reserveRetainedBytes>
			| undefined;
		const finish = vi.fn(() => {
			if (closeDuringFinish) {
				session.forceClose();
			}
			reentrantOwnerReservation =
				session._host.reserveRetainedBytes(maximumBytes);
		});

		try {
			const invocation = session.prepareInvocation(request, finish);
			if (invocation === undefined) {
				throw new Error(
					"Expected Pending Invocation capacity before encoding.",
				);
			}
			invocation.start();

			expect(rejectedEnvelopes).toEqual([
				expect.objectContaining({
					kind: RpcWireRecordKindEnum.message,
					seq: 1,
					message: expect.objectContaining({ callId: "1" }),
				}),
			]);
			expect(finish).toHaveBeenCalledExactlyOnceWith({
				type: RpcCallTerminalTypeEnum.failed,
				code: "unavailable",
			});
			expect(sent).toEqual([]);
			expect(faults).toEqual([]);
			expect(reentrantOwnerReservation).toBeUndefined();
			const afterFinish = session._host.reserveRetainedBytes(maximumBytes);
			expect(afterFinish).toBeDefined();
			afterFinish?.release();

			if (!closeDuringFinish) {
				const next = session.prepareInvocation(request, () => undefined);
				if (next === undefined) {
					throw new Error("Expected capacity after failed admission.");
				}
				next.start();
				await vi.waitFor(() => expect(sent).toHaveLength(1));
				expect(sent[0]).toMatchObject({
					seq: 1,
					message: { kind: RpcWireRecordKindEnum.call, callId: "1" },
				});
			}
		} finally {
			encodeSpy.mockRestore();
			reentrantOwnerReservation?.release();
			session.forceClose();
		}
	});

	it("RPC-CALL-008 RPC-RESOURCE-003 releases committed incoming storage when reentrant Owner close wins", async () => {
		const maximumBytes = 4 * 1024 * 1024;
		let capturedHost: IRpcProtocolHost | undefined;
		const protocolFactory = (
			host: Parameters<typeof createRpcProtocolAcceptor>[0],
		) => {
			capturedHost = host;
			return createRpcProtocolAcceptor(host);
		};
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ILedgerService, {
			wireName: "example.reentrant-incoming-ledger.v1",
			methods: { run: true },
		});
		const handler = vi.fn((value: number) => value);
		const acceptor = createRpcAcceptor({
			protocolFactory,
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
		const finish = vi.fn();
		const invocation = harness.session.prepareInvocation(
			{
				service: "example.outgoing-ledger.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(["x".repeat(512 * 1024)]),
			},
			finish,
		);
		if (invocation === undefined) {
			throw new Error("Expected outgoing Invocation capacity.");
		}

		invocation.start();
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));

		const remainingCapacity =
			harness.session._host.policy.maxRetainedBytesPerSession -
			RPC_PROTECTED_SESSION_BYTES;
		expect(
			harness.session.reserveRetainedBytes(remainingCapacity),
		).toBeUndefined();
		harness.receive(
			codec.encode({ kind: RpcWireRecordKindEnum.ack, ackThrough: 1 }),
		);
		const reclaimed = harness.session.reserveRetainedBytes(remainingCapacity);
		expect(reclaimed).toBeDefined();
		reclaimed?.release();
		expect(finish).not.toHaveBeenCalled();
		harness.receive(
			codec.encode({
				kind: RpcWireRecordKindEnum.message,
				seq: 1,
				message: {
					kind: RpcWireRecordKindEnum.result,
					callId: "1",
				},
			}),
		);
		expect(finish).toHaveBeenCalledExactlyOnceWith({
			type: RpcCallTerminalTypeEnum.returnedVoid,
		});
		expect(harness.faults).toEqual([]);

		harness.session.forceClose();
	});

	it("RPC-LEDGER-005 terminal ACK and Session teardown cannot finish Framework work again", async () => {
		const harness = createRpcDirectSessionHarness();
		const finishes: unknown[] = [];
		(harness.session._continuity as RpcSessionContinuityImpl)._sessionHost = {
			reserveIncomingCall: (_request, consume) => {
				consume({
					kind: RpcIncomingCallKindEnum.handler,
					commit: () => ({
						handlerOutcome: Promise.resolve({
							type: RpcCallTerminalTypeEnum.returnedVoid,
						}),
						finish: (outcome) => finishes.push(outcome),
					}),
				});
				return true;
			},
			transition() {},
			fault() {},
		};

		harness.receive(
			codec.encode({
				kind: RpcWireRecordKindEnum.message,
				seq: 1,
				message: {
					kind: RpcWireRecordKindEnum.call,
					callId: "1",
					service: "example.finished-call.v1",
					method: "run",
					args: [1],
				},
			}),
		);
		await vi.waitFor(() => expect(harness.sent).toHaveLength(1));

		expect(finishes).toEqual([{ type: RpcCallTerminalTypeEnum.returnedVoid }]);
		harness.receive(
			codec.encode({ kind: RpcWireRecordKindEnum.ack, ackThrough: 1 }),
		);
		harness.session.forceClose();
		expect(finishes).toEqual([{ type: RpcCallTerminalTypeEnum.returnedVoid }]);
	});
});
