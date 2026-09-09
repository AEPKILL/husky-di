/**
 * @overview Verifies protocol scheduling.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	RpcStateStatusEnum,
} from "../../src/index";
import {
	RpcConnectorPublisherImpl,
	RpcHandlerSchedulerImpl,
} from "../../src/modules/owner";
import { createRpcPeer } from "../../src/modules/peer";
import {
	normalizeRpcApplicationArguments,
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
} from "../../src/modules/protocol";
import type { IRpcProtocolIncomingHandlerCall } from "../../src/protocol";
import { createRpcTestNetwork } from "../protocol/test.utils";
import {
	IRequirementsService,
	IScheduledRequirementsService,
} from "./requirements/test.utils";

describe("Default RPC Protocol remaining requirements", () => {
	it("RPC-SCHEDULE-005 serializes synchronous ingress emissions and never runs handlers in the Transport callback", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IRequirementsService, {
			wireName: "example.ingress-order.v1",
			methods: { run: true },
		});
		const acceptor = createRpcAcceptor();
		const connector = createRpcConnector();
		const handlerOrder: string[] = [];
		let insideTransportCallback = false;
		acceptor.expose(descriptor, {
			run(value) {
				expect(insideTransportCallback).toBe(false);
				handlerOrder.push(value);
				return value.length;
			},
		});
		network.setInterceptor((record) =>
			record.direction === "acceptor" && record.value.kind === "message"
				? { drop: true }
				: undefined,
		);

		await acceptor.listen(network.acceptorAdapter);
		await connector.connect({ adapter: network.createConnectorAdapter() });
		const encoder = new TextEncoder();
		insideTransportCallback = true;
		for (const [seq, value] of ["first", "second"].entries()) {
			network.emit(
				1,
				"acceptor",
				encoder.encode(
					JSON.stringify({
						kind: "message",
						seq: seq + 1,
						message: {
							kind: "call",
							callId: String(seq + 1),
							service: "example.ingress-order.v1",
							method: "run",
							args: [value],
						},
					}),
				),
			);
		}
		insideTransportCallback = false;

		await expect.poll(() => handlerOrder).toEqual(["first", "second"]);
		await Promise.all([connector.close(), acceptor.close()]);
	});

	it("RPC-SCHEDULE-006 RPC-CORPUS-004 preserves per-Session FIFO and round-robins ready Sessions while a running handler owns the sole permit", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(
			IScheduledRequirementsService,
			{
				wireName: "example.handler-fairness.v1",
				methods: { run: true },
			},
		);
		const acceptor = createRpcAcceptor({
			runtimePolicy: { maxHandlersPerSession: 1, maxHandlersTotal: 1 },
		});
		const firstConnector = createRpcConnector();
		const secondConnector = createRpcConnector();
		const starts: string[] = [];
		const resolvers = new Map<string, (value: string) => void>();
		acceptor.expose(descriptor, {
			run(value) {
				starts.push(value);
				return new Promise<string>((resolve) => {
					resolvers.set(value, resolve);
				});
			},
		});

		await acceptor.listen(network.acceptorAdapter);
		await firstConnector.connect({ adapter: network.createConnectorAdapter() });
		await secondConnector.connect({
			adapter: network.createConnectorAdapter(),
		});
		const firstService = firstConnector.peer.resolve(descriptor);
		const secondService = secondConnector.peer.resolve(descriptor);
		const first = firstService.run("first-a");
		await expect.poll(() => starts).toEqual(["first-a"]);
		const sameSessionNext = firstService.run("first-b");
		const otherSession = secondService.run("second-a");
		await Promise.resolve();
		expect(starts).toEqual(["first-a"]);

		resolvers.get("first-a")?.("first-a");
		await expect(first).resolves.toBe("first-a");
		await expect.poll(() => starts).toEqual(["first-a", "second-a"]);
		resolvers.get("second-a")?.("second-a");
		await expect(otherSession).resolves.toBe("second-a");
		await expect.poll(() => starts).toEqual(["first-a", "second-a", "first-b"]);
		resolvers.get("first-b")?.("first-b");
		await expect(sameSessionNext).resolves.toBe("first-b");

		await Promise.all([
			firstConnector.close(),
			secondConnector.close(),
			acceptor.close(),
		]);
	});

	it("RPC-CALL-008 RPC-SCHEDULE-006 removes a terminal queued handler before its Owner permit becomes available", async () => {
		const scheduler = new RpcHandlerSchedulerImpl(1, 1);
		const blocker = Promise.withResolvers<void>();
		let blockerStarted = false;
		scheduler.enqueue({}, () => {
			blockerStarted = true;
			return blocker.promise;
		});
		await expect.poll(() => blockerStarted).toBe(true);

		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const host = publisher.registerPeer(
			{ status: RpcStateStatusEnum.connected },
			({ readState, state$ }) =>
				createRpcPeer({
					readState,
					state$,
					getSession: () => undefined,
					findOwnerExposure: () => undefined,
					isOwnerActive: () => true,
					callEventSink: () => {},
					onProtocolFault: () => {},
					handlerScheduler: scheduler,
					maximumIncomingBytes: 1024 * 1024,
					reserveRetainedBytes: () => ({ release() {} }),
				}),
		);
		const peer = host.peer;
		const descriptor = createRemoteServiceDescriptor(
			IScheduledRequirementsService,
			{
				wireName: "example.terminal-queued-handler.v1",
				methods: { run: true },
			},
		);
		let handlerStarts = 0;
		peer.expose(descriptor, {
			async run(value) {
				handlerStarts += 1;
				return value;
			},
		});
		let call: IRpcProtocolIncomingHandlerCall | undefined;
		const reserved = host.reserveIncomingCall(
			{
				service: "example.terminal-queued-handler.v1",
				method: "run",
				args: normalizeRpcApplicationArguments(["payload"]),
			},
			(reservation) => {
				if (reservation.kind !== RpcIncomingCallKindEnum.handler) {
					throw new Error("Expected a queued handler reservation.");
				}
				call = reservation.commit();
				return undefined;
			},
		);
		if (!reserved || call === undefined) {
			throw new Error("Expected a queued handler reservation.");
		}

		call.finish({ type: RpcCallTerminalTypeEnum.sessionTerminated });
		let sentinelStarted = false;
		scheduler.enqueue({}, () => {
			sentinelStarted = true;
			return Promise.resolve();
		});
		blocker.resolve();
		await expect.poll(() => sentinelStarted).toBe(true);

		expect(handlerStarts).toBe(0);
	});

	it("RPC-CORPUS-004 RPC-SHUTDOWN-008 gracefully converges the default 64-Session boundary in parallel", async () => {
		const network = createRpcTestNetwork();
		const acceptor = createRpcAcceptor();
		const connectors = Array.from({ length: 64 }, () => createRpcConnector());
		const closeSettlement = Promise.withResolvers<void>();
		network.setInterceptor((record) =>
			record.direction === "acceptor" && record.value.kind === "close"
				? { settlement: closeSettlement.promise }
				: undefined,
		);

		await acceptor.listen(network.acceptorAdapter);
		for (const connector of connectors) {
			await connector.connect({
				adapter: network.createConnectorAdapter("silent"),
			});
		}
		expect(acceptor.peers).toHaveLength(64);

		const shutdown = acceptor.shutdown();
		await expect
			.poll(
				() =>
					network.records.filter(
						(record) =>
							record.direction === "acceptor" && record.value.kind === "close",
					).length,
			)
			.toBe(64);
		closeSettlement.resolve();
		await shutdown;
		expect(acceptor.peers).toEqual([]);
		await Promise.all(connectors.map((connector) => connector.close()));
	});
});
