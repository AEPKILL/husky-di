/**
 * @overview Shared Transport conformance against controlled native WebSocket boundaries.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import {
	type IRpcAcceptorAdapterConformanceFixture,
	type IRpcConnectorAdapterConformanceFixture,
	type RpcConformanceCaseResult,
	RpcConformanceStatusEnum,
	runRpcAcceptorAdapterConformance,
	runRpcConnectorAdapterConformance,
} from "@husky-di/remote/conformance";
import { describe, expect, it } from "vitest";

import { createSocketConnectorAdapter } from "../src/modules/connector";
import { createSocketAcceptorAdapter } from "../src/modules/node";
import type { IWebSocketLike } from "../src/shared/interfaces/web-socket-platform.interface";
import { ControlledWebSocket, createControlledRemote } from "./test.utils";

describe("WebSocket shared Transport conformance", () => {
	it("RPC-CONFORMANCE-003 RPC-RELEASE-005 passes every Connector Adapter case", async () => {
		const reports: RpcConformanceCaseResult[] = [];
		await runRpcConnectorAdapterConformance(createConnectorFixture(), {
			report: (report) => reports.push(report),
		});
		expect(reports).toHaveLength(10);
		expect(
			reports.every(
				(report) => report.status === RpcConformanceStatusEnum.passed,
			),
		).toBe(true);
	});

	it("RPC-CONFORMANCE-003 RPC-RELEASE-005 passes every Acceptor Adapter case", async () => {
		const reports: RpcConformanceCaseResult[] = [];
		await runRpcAcceptorAdapterConformance(createAcceptorFixture(), {
			report: (report) => reports.push(report),
		});
		expect(reports).toHaveLength(14);
		expect(
			reports.every(
				(report) => report.status === RpcConformanceStatusEnum.passed,
			),
		).toBe(true);
	});
});

const limits = {
	maxMessageBytes: 1_048_576,
	maxQueuedMessages: 16,
	maxQueuedBytes: 4_194_304,
};

function createConnectorFixture(): IRpcConnectorAdapterConformanceFixture {
	return {
		async create() {
			const started = Promise.withResolvers<ControlledWebSocket>();
			let socket: ControlledWebSocket | undefined;
			let firstMessage: Uint8Array | undefined;
			const adapter = createSocketConnectorAdapter({
				createSocket() {
					socket = new ControlledWebSocket();
					started.resolve(socket);
					return socket;
				},
				limits,
			});
			adapter.connection$.subscribe({
				next(connection) {
					connection.message$.subscribe({ error: () => {} });
					// Exercise the gate with a native event inside the first observer,
					// before the conformance runner's owner has even subscribed.
					if (firstMessage !== undefined) {
						socket?.message(firstMessage);
					}
				},
				error: () => {},
			});
			return {
				adapter,
				async handoff(message) {
					const nativeSocket = await started.promise;
					firstMessage = message;
					nativeSocket.open();
					return createControlledRemote(nativeSocket, limits.maxQueuedBytes);
				},
				async failStartup(error) {
					(await started.promise).fail(error);
				},
				async cleanup() {
					socket?.terminate();
					await socket?.waitForClose();
				},
			};
		},
	};
}

function createAcceptorFixture(): IRpcAcceptorAdapterConformanceFixture {
	return {
		async create() {
			const started = Promise.withResolvers<void>();
			const sockets: ControlledWebSocket[] = [];
			let canAccept = () => false;
			let handleListening = (): void => {};
			let handleConnection = (_socket: IWebSocketLike): void => {};
			let handleError = (_error: Error): void => {};
			let handleClose = (): void => {};
			let firstMessage: Uint8Array | undefined;
			const adapter = createSocketAcceptorAdapter({
				createListener(admissionGate) {
					canAccept = admissionGate;
					started.resolve();
					return {
						alreadyListening: false,
						onListening(listener) {
							handleListening = listener;
							return () => {
								handleListening = () => {};
							};
						},
						onConnection(listener) {
							handleConnection = listener;
							return () => {
								handleConnection = () => {};
							};
						},
						onError(listener) {
							handleError = listener;
							return () => {
								handleError = () => {};
							};
						},
						onClose(listener) {
							handleClose = listener;
							return () => {
								handleClose = () => {};
							};
						},
						close() {
							queueMicrotask(() => handleClose());
						},
					};
				},
				limits,
				maxConnections: 16,
			});
			adapter.connection$.subscribe({
				next(connection) {
					connection.message$.subscribe({ error: () => {} });
					if (firstMessage !== undefined) {
						sockets[sockets.length - 1]?.message(firstMessage);
					}
				},
				error: () => {},
			});
			return {
				adapter,
				async accept(message) {
					await started.promise;
					if (!canAccept()) {
						throw new Error("The native listener stopped accepting sockets.");
					}
					firstMessage = message;
					const socket = new ControlledWebSocket();
					socket.open();
					sockets.push(socket);
					handleConnection(socket);
					return createControlledRemote(socket, limits.maxQueuedBytes);
				},
				async markReady() {
					await started.promise;
					handleListening();
				},
				async completeListener() {
					handleClose();
				},
				async failListener(error) {
					await started.promise;
					handleError(error);
				},
				async cleanup() {
					handleClose();
					for (const socket of sockets) {
						socket.terminate();
					}
					await Promise.all(sockets.map((socket) => socket.waitForClose()));
				},
			};
		},
	};
}
