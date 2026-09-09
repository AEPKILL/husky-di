/**
 * @overview Verifies recovery.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
	createRpcConnectorReconnection,
	type IRpcConnectorAdapter,
	type RpcEvent,
	RpcEventTypeEnum,
	RpcStateStatusEnum,
} from "../../src/index";
import { createRpcTestNetwork } from "../protocol/test.utils";
import { IDeferredService } from "./test.utils";

describe("Owner interface compatibility with complete Protocol Recovery", () => {
	it("RPC-API-001 RPC-RECOVERY-004 RPC-RECONNECT-002 resumes the same Peer and facade without dispatching an admitted handler twice", async () => {
		const network = createRpcTestNetwork();
		const descriptor = createRemoteServiceDescriptor(IDeferredService, {
			wireName: "example.owner-compatibility.v1",
			methods: { run: true },
		});
		const policy = {
			ackDelayMs: 1,
			bindingAttemptTimeoutMs: 1_000,
			recoveryGraceMs: 5_000,
		};
		const acceptor = createRpcAcceptor({ runtimePolicy: policy });
		const connector = createRpcConnector({ runtimePolicy: policy });
		const deferred = Promise.withResolvers<number>();
		const handler = vi.fn(() => deferred.promise);
		acceptor.expose(descriptor, { run: handler });
		const peer = connector.peer;
		const facade = peer.resolve(descriptor);
		const opened: RpcEvent[] = [];
		acceptor.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.peerOpened) opened.push(event);
		});
		const adapters: IRpcConnectorAdapter[] = [];
		const reconnection = createRpcConnectorReconnection({
			connector,
			adapterFactory: () => {
				const adapter = network.createConnectorAdapter();
				adapters.push(adapter);
				return adapter;
			},
		});
		try {
			await acceptor.listen(network.acceptorAdapter);
			await reconnection.connect();
			const acceptorPeer = acceptor.peers[0];
			const call = facade.run(42);
			void call.catch(() => {});
			await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
			network.disconnect(1);
			await vi.waitFor(() => {
				expect(adapters).toHaveLength(2);
				expect(reconnection.state.status).toBe("monitoring");
				expect(connector.peer.state.status).toBe(RpcStateStatusEnum.connected);
			});
			expect(adapters[1]).not.toBe(adapters[0]);
			expect(connector.peer).toBe(peer);
			expect(acceptor.peers).toEqual([acceptorPeer]);
			expect(opened).toHaveLength(1);
			expect(handler).toHaveBeenCalledTimes(1);
			expect(
				network.records.some(
					(record) =>
						record.connectionId === 2 && record.value.kind === "resume",
				),
			).toBe(true);
			deferred.resolve(42);
			await expect(call).resolves.toBe(42);
			await expect(facade.run(43)).resolves.toBe(42);
			expect(handler).toHaveBeenCalledTimes(2);
		} finally {
			deferred.resolve(42);
			await reconnection.stop();
			await Promise.all([connector.close(), acceptor.close()]);
		}
	});
});
