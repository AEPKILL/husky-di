/**
 * @overview Verifies stream recovery replay, independent identity, and bounded duplicate evidence.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:20:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { Observable, Subject } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import { normalizeRpcApplicationArguments } from "../../src/modules/protocol";
import {
	createRpcDirectSessionHarness,
	createRpcTestNetwork,
} from "./test.utils";

afterEach(() => vi.useRealTimers());

describe("stream delivery continuity", () => {
	it("RPC-STREAM-003 RPC-STREAM-006 RPC-LEDGER-001 RPC-LEDGER-002 keeps stream identity independent and suppresses replayed items and late terminals", async () => {
		const harness = createRpcDirectSessionHarness();
		const values: unknown[] = [];
		const complete = vi.fn();
		const error = vi.fn();
		const stream = harness.session.prepareStream(
			{
				service: "service",
				method: "ticks",
				args: normalizeRpcApplicationArguments([]),
			},
			{ next: (value) => values.push(value.value), complete, error },
		);
		stream?.start();
		harness.session
			.prepareInvocation(
				{
					service: "service",
					method: "run",
					args: normalizeRpcApplicationArguments([]),
				},
				() => {},
			)
			?.start();
		await vi.waitFor(() =>
			expect(
				harness.sent.filter((record) => record.kind === "message"),
			).toHaveLength(2),
		);
		expect(harness.sent[0]).toMatchObject({
			seq: 1,
			message: { kind: "stream-open", streamId: "1" },
		});
		expect(harness.sent[1]).toMatchObject({
			seq: 2,
			message: { kind: "call", callId: "1" },
		});
		const send = (seq: number, message: object) =>
			harness.receive(
				new TextEncoder().encode(
					JSON.stringify({ kind: "message", seq, message }),
				),
			);
		send(1, { kind: "stream-next", streamId: "1", value: 7 });
		send(1, { kind: "stream-next", streamId: "1", value: 7 });
		send(2, { kind: "stream-complete", streamId: "1" });
		send(3, { kind: "stream-next", streamId: "1", value: 9 });
		expect(values).toEqual([7]);
		expect(complete).toHaveBeenCalledOnce();
		expect(error).not.toHaveBeenCalled();
		expect(harness.faults).toEqual([]);
		harness.session.forceClose();
	});
});

describe("bounded stream duplicate evidence", () => {
	it("RPC-STREAM-003 faults when a retained duplicate sequence rewrites its semantic body", async () => {
		const harness = createRpcDirectSessionHarness();
		const observer = { next: vi.fn(), complete: vi.fn(), error: vi.fn() };
		harness.session
			.prepareStream(
				{
					service: "s",
					method: "ticks",
					args: normalizeRpcApplicationArguments([]),
				},
				observer,
			)
			?.start();
		const send = (value: number) =>
			harness.receive(
				new TextEncoder().encode(
					JSON.stringify({
						kind: "message",
						seq: 1,
						message: { kind: "stream-next", streamId: "1", value },
					}),
				),
			);
		send(1);
		send(2);
		expect(harness.faults).toEqual(["protocol-fault"]);
		expect(observer.next).toHaveBeenCalledOnce();
		harness.session.forceClose();
	});
});

describe("stream duplicate evidence compaction", () => {
	it("RPC-STREAM-003 RPC-LEDGER-005 evicts a bounded duplicate window while preserving its receipt high-water mark", () => {
		const harness = createRpcDirectSessionHarness();
		const next = vi.fn();
		harness.session
			.prepareStream(
				{
					service: "s",
					method: "ticks",
					args: normalizeRpcApplicationArguments([]),
				},
				{ next, complete: vi.fn(), error: vi.fn() },
			)
			?.start();
		const send = (seq: number, value: number) =>
			harness.receive(
				new TextEncoder().encode(
					JSON.stringify({
						kind: "message",
						seq,
						message: { kind: "stream-next", streamId: "1", value },
					}),
				),
			);
		for (let seq = 1; seq <= 65; seq += 1) send(seq, seq);
		send(1, 999);
		expect(next).toHaveBeenCalledTimes(65);
		expect(harness.faults).toEqual([]);
		send(65, 999);
		expect(harness.faults).toEqual(["protocol-fault"]);
		harness.session.forceClose();
	});
});

describe("stream source recovery", () => {
	it("RPC-STREAM-006 RPC-ACK-007 replays admitted items before disconnected emissions without reopening the source", async () => {
		const descriptor = createRemoteServiceDescriptor(
			createServiceIdentifier<{ ticks(): Observable<number> }>(
				"IRecoveringStream",
			),
			{
				wireName: "recovering-stream",
				members: { ticks: { kind: "observable-function" } },
			},
		);
		const source = new Subject<number>();
		let subscriptions = 0;
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		acceptor.expose(descriptor, {
			ticks: () =>
				new Observable((observer) => {
					subscriptions += 1;
					return source.subscribe(observer);
				}),
		});
		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const values: number[] = [];
		const complete = vi.fn();
		const error = vi.fn();
		connector.peer
			.resolve(descriptor)
			.ticks()
			.subscribe({ next: (value) => values.push(value), complete, error });
		await vi.waitFor(() => expect(subscriptions).toBe(1));
		network.setInterceptor((record) =>
			record.direction === "acceptor" &&
			record.value.kind === "message" &&
			(record.value.message as { kind: string }).kind === "stream-next"
				? { drop: true }
				: undefined,
		);
		source.next(1);
		await vi.waitFor(() =>
			expect(
				network.records.some(
					(record) =>
						record.direction === "acceptor" && record.value.kind === "message",
				),
			).toBe(true),
		);
		network.disconnect(1);
		await vi.waitFor(() =>
			expect(connector.peer.state.status).toBe("recovering"),
		);
		source.next(2);
		source.next(3);
		network.setInterceptor(undefined);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		await vi.waitFor(() => expect(values).toEqual([1, 2, 3]));
		source.complete();
		await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
		expect(error).not.toHaveBeenCalled();
		expect(subscriptions).toBe(1);
		expect(
			network.records.filter(
				(record) =>
					record.value.kind === "message" &&
					(record.value.message as { kind: string }).kind === "stream-open",
			),
		).toHaveLength(1);
		const itemRecords = network.records.filter(
			(record) =>
				record.direction === "acceptor" &&
				record.value.kind === "message" &&
				(record.value.message as { kind: string }).kind === "stream-next",
		);
		expect(itemRecords.map((record) => record.value.seq)).toEqual([1, 1, 2, 3]);
		await Promise.all([connector.close(), acceptor.close()]);
	});
});
