/**
 * @overview Verifies close.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	createRpcConnector,
} from "../../src/index";
import {
	createRecoveryNetwork,
	IDeferredCalculatorService,
} from "./network/test.utils";

afterEach(() => vi.useRealTimers());

describe("Default RPC Protocol", () => {
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
});
