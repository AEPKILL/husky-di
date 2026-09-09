/**
 * @overview Verifies protocol terminal.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { Observable } from "rxjs";
import { describe, expect, it } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	RpcCloseReasonEnum,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "../../src/index";
import type { IRpcConnection } from "../../src/protocol";
import {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "../../src/protocol";
import { createRpcTestNetwork } from "../protocol/test.utils";
import { IDeferredService } from "./test.utils";

describe("Default Protocol semantic terminal barriers", () => {
	it("RPC-SPI-012 RPC-SHUTDOWN-009 completes semantic shutdown after remote Close before physical cleanup", async () => {
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.semantic-shutdown.v1",
			methods: { run: true },
		});
		const network = createRpcTestNetwork();
		const physicalCleanup = Promise.withResolvers<void>();
		const handlerStarted = Promise.withResolvers<void>();
		const handler = Promise.withResolvers<number>();
		const order: string[] = [];
		let directCloseStarted = false;
		let protocol: ReturnType<typeof createRpcProtocolConnector> | undefined;
		const connector = createRpcConnector({
			protocolFactory(host) {
				protocol = createRpcProtocolConnector(host);
				return protocol;
			},
		});
		const acceptor = createRpcAcceptor();
		acceptor.expose(descriptor, {
			run() {
				handlerStarted.resolve();
				return handler.promise;
			},
		});
		const adapter = network.createConnectorAdapter("silent");
		try {
			await acceptor.listen(network.acceptorAdapter);
			await connector.connect({
				adapter: {
					connect: (signal) => adapter.connect(signal),
					connection$: new Observable<IRpcConnection>((subscriber) =>
						adapter.connection$.subscribe({
							next(connection) {
								subscriber.next({
									message$: connection.message$,
									send: (message) => connection.send(message),
									close() {
										if (!directCloseStarted) {
											directCloseStarted = true;
											order.push("direct-close");
											void connection.close();
										}
										return physicalCleanup.promise;
									},
								});
							},
							error: (error: unknown) => subscriber.error(error),
							complete: () => subscriber.complete(),
						}),
					),
				},
			});
			const call = connector.peer.resolve(descriptor).run(1);
			void call.catch(() => {});
			await handlerStarted.promise;
			if (protocol === undefined)
				throw new Error("Expected the built-in Protocol role.");
			const shutdown = protocol
				.shutdown()
				.then(() => order.push("semantic-shutdown"));
			const recordsBeforeClose = network.records.length;
			network.emit(
				1,
				"connector",
				new TextEncoder().encode('{"kind":"close"}'),
			);
			await expect(call).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
			await shutdown;
			expect(order).toEqual(["direct-close", "semantic-shutdown"]);
			expect(connector.state.status).toBe(RpcStateStatusEnum.closing);
			expect(connector.peer.state).toMatchObject({
				status: RpcStateStatusEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});
			expect(
				network.records
					.slice(recordsBeforeClose)
					.filter((record) => record.direction === "connector"),
			).toEqual([]);
		} finally {
			physicalCleanup.resolve();
			handler.resolve(1);
			await Promise.all([connector.close(), acceptor.close()]);
		}
	});

	it("RPC-SHUTDOWN-008 RPC-SHUTDOWN-009 keeps a healthy cutoff Session in the Acceptor grace barrier after remote Close", async () => {
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.sibling-grace.v1",
			methods: { run: true },
		});
		const network = createRpcTestNetwork();
		let protocol: ReturnType<typeof createRpcProtocolAcceptor> | undefined;
		const acceptor = createRpcAcceptor({
			runtimePolicy: { ackDelayMs: 1 },
			protocolFactory(host) {
				protocol = createRpcProtocolAcceptor(host);
				return protocol;
			},
		});
		const firstConnector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		const secondConnector = createRpcConnector({
			runtimePolicy: { ackDelayMs: 1 },
		});
		const firstStarted = Promise.withResolvers<void>();
		const secondStarted = Promise.withResolvers<void>();
		const firstHandler = Promise.withResolvers<number>();
		const secondHandler = Promise.withResolvers<number>();
		firstConnector.peer.expose(descriptor, {
			run() {
				firstStarted.resolve();
				return firstHandler.promise;
			},
		});
		secondConnector.peer.expose(descriptor, {
			run() {
				secondStarted.resolve();
				return secondHandler.promise;
			},
		});
		const directCloses: string[] = [];
		try {
			await acceptor.listen(network.acceptorAdapter);
			await firstConnector.connect({
				adapter: network.createConnectorAdapter("silent", (direction) =>
					directCloses.push(`first-${direction}`),
				),
			});
			await secondConnector.connect({
				adapter: network.createConnectorAdapter("silent", (direction) =>
					directCloses.push(`second-${direction}`),
				),
			});
			const [firstPeer, secondPeer] = acceptor.peers;
			if (
				firstPeer === undefined ||
				secondPeer === undefined ||
				protocol === undefined
			)
				throw new Error("Expected two Session peers and the Acceptor role.");
			const firstCall = firstPeer.resolve(descriptor).run(1);
			const secondCall = secondPeer.resolve(descriptor).run(2);
			void firstCall.catch(() => {});
			void secondCall.catch(() => {});
			await Promise.all([firstStarted.promise, secondStarted.promise]);
			let ownerSettled = false;
			let roleSettled = false;
			const shutdown = acceptor.shutdown().then(() => {
				ownerSettled = true;
			});
			const roleShutdown = protocol.shutdown().then(() => {
				roleSettled = true;
			});
			network.emit(1, "acceptor", new TextEncoder().encode('{"kind":"close"}'));
			await expect(firstCall).rejects.toMatchObject({
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
			expect(directCloses).toEqual(["first-acceptor"]);
			expect(firstPeer.state).toMatchObject({
				status: RpcStateStatusEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});
			expect(acceptor.peers).toEqual([secondPeer]);
			expect(secondPeer.state.status).toBe(RpcStateStatusEnum.draining);
			expect({ ownerSettled, roleSettled }).toEqual({
				ownerSettled: false,
				roleSettled: false,
			});
			secondHandler.resolve(20);
			await expect(secondCall).resolves.toBe(20);
			await Promise.all([shutdown, roleShutdown]);
			expect({ ownerSettled, roleSettled }).toEqual({
				ownerSettled: true,
				roleSettled: true,
			});
			expect(directCloses).toEqual([
				"first-acceptor",
				expect.stringMatching(/^second-/),
			]);
			expect(
				network.records.filter(
					(record) =>
						record.direction === "acceptor" && record.value.kind === "close",
				),
			).toHaveLength(1);
		} finally {
			firstHandler.resolve(10);
			secondHandler.resolve(20);
			await Promise.all([
				acceptor.close(),
				firstConnector.close(),
				secondConnector.close(),
			]);
		}
	});
});
