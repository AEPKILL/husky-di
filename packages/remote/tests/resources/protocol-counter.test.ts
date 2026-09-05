/**
 * @overview Default Protocol counter reserve and per-Session drain behavior.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it, vi } from "vitest";
import { RpcWireRecordKindEnum } from "../../src/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import {
	createRpcCounterExhaustionProtocolAcceptorForTest,
	createRpcCounterExhaustionProtocolConnectorForTest,
} from "../../src/factories/rpc-protocol.factory";
import { RpcSessionInvocationsImpl } from "../../src/impls/session/rpc-session-invocations.impl";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { normalizeRpcApplicationArguments } from "../../src/utils/rpc-application-value.util";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "../protocol/test.utils";

interface ICounterService {
	run(): number;
}

const ICounterService =
	createServiceIdentifier<ICounterService>("ICounterService");

describe("Default RPC Protocol counter drain", () => {
	it("RPC-SHUTDOWN-010 ignores a pending Activity Probe when evaluating the complete drain predicate", async () => {
		const { session, sent } = createRpcDirectSessionHarness();
		session._activity?.recordInbound(RpcWireRecordKindEnum.ping);
		expect(session._activity?.hasPendingProbe).toBe(true);

		const shutdown = session.shutdown();

		await vi.waitFor(() => expect(sent).toContainEqual({ kind: "close" }));
		await shutdown;
	});

	it("RPC-COUNTER-001 RPC-COUNTER-002 consumes the final 512 protected sequences without leaving the safe-integer domain RPC-CORPUS-004", async () => {
		const { session, sent, transitions, faults } =
			createRpcDirectSessionHarness();
		session._nextOutgoingSequence = Number.MAX_SAFE_INTEGER - 511;
		for (let ordinal = 1; ordinal <= 256; ordinal += 1) {
			session._queueSemantic({
				kind: RpcWireRecordKindEnum.cancel,
				callId: String(ordinal),
			});
		}
		for (let ordinal = 257; ordinal <= 512; ordinal += 1) {
			session._queueSemantic({
				kind: RpcWireRecordKindEnum.error,
				callId: String(ordinal),
				error: {
					code: RpcExceptionCodeEnum.unavailable,
					message: "Remote call failed with code unavailable.",
				},
			});
		}
		session._beginCounterDrain();

		await vi.waitFor(() => expect(sent).toHaveLength(512));

		expect(session._highestSentSequence).toBe(Number.MAX_SAFE_INTEGER);
		expect(Number.isSafeInteger(session._nextOutgoingSequence)).toBe(true);
		session._applyAck(Number.MAX_SAFE_INTEGER);
		session._queueSemantic({
			kind: RpcWireRecordKindEnum.cancel,
			callId: "513",
		});
		await vi.waitFor(() => {
			expect(transitions).toContainEqual(
				expect.objectContaining({
					type: "closed",
					reason: "counter-exhaustion",
				}),
			);
		});
		expect(faults).toEqual([]);

		session.forceClose();
	});

	it("RPC-COUNTER-001 RPC-COUNTER-003 drains after allocating the last safe Call Ordinal RPC-CORPUS-004", async () => {
		const { session, sent, transitions } = createRpcDirectSessionHarness(
			{},
			(options) =>
				new RpcSessionInvocationsImpl(options, Number.MAX_SAFE_INTEGER),
		);
		const invocation = session.prepareInvocation(
			{
				service: "example.counter.v1",
				method: "run",
				args: normalizeRpcApplicationArguments([]),
			},
			() => undefined,
		);
		if (invocation === undefined) {
			throw new Error("Expected the last Call Ordinal reservation.");
		}

		invocation.start();
		await vi.waitFor(() => expect(sent).toHaveLength(1));

		expect(sent[0]).toMatchObject({
			kind: "message",
			seq: 1,
			message: { kind: "call", callId: String(Number.MAX_SAFE_INTEGER) },
		});
		expect(transitions).toContainEqual({
			type: "draining",
			reason: "counter-exhaustion",
		});

		session.forceClose();
	});

	it("RPC-COUNTER-002 RPC-COUNTER-004 reserves the final 512 sequences and settles the triggering Pending Invocation", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ICounterService, {
			wireName: "example.counter.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor({
			protocolFactory: createRpcCounterExhaustionProtocolAcceptorForTest,
		});
		const connector = createRpcConnector({
			protocolFactory: createRpcCounterExhaustionProtocolConnectorForTest,
		});
		const states: string[] = [];
		connector.peer.state$.subscribe((state) => states.push(state.status));
		acceptor.expose(descriptor, { run: () => 1 });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		let failureCode: unknown;
		const call = connector.peer.resolve(descriptor).run();
		void call.catch((error: unknown) => {
			failureCode = Reflect.get(error as object, "code");
		});

		await Promise.resolve();
		await Promise.resolve();

		expect(states).toContain("draining");
		expect(failureCode).toBe("unavailable");
		expect(
			network.records.some(
				(record) =>
					record.direction === "connector" && record.value.kind === "message",
			),
		).toBe(false);

		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-COUNTER-004 completes an empty counter drain with one unsequenced Close", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(ICounterService, {
			wireName: "example.counter.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor({
			protocolFactory: createRpcCounterExhaustionProtocolAcceptorForTest,
		});
		const connector = createRpcConnector({
			protocolFactory: createRpcCounterExhaustionProtocolConnectorForTest,
		});
		acceptor.expose(descriptor, { run: () => 1 });

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		void connector.peer
			.resolve(descriptor)
			.run()
			.catch(() => {});
		await Promise.resolve();
		await Promise.resolve();

		expect(
			network.records.filter(
				(record) =>
					record.direction === "connector" && record.value.kind === "close",
			),
		).toHaveLength(1);

		await Promise.all([connector.close(), acceptor.close()]);
	});
});
