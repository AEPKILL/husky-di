/**
 * @overview Verifies owner factories.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import packageManifest from "../../package.json";
import { createRpcAcceptor, createRpcConnector } from "../../src/index";
import {
	createRpcProtocolAcceptor,
	createRpcProtocolConnector,
} from "../../src/protocol";
import { createProtocolHarness } from "./test.utils";

describe("cold Topology Owner factories", () => {
	it("RPC-PKG-003 exposes reusable built-in Protocol role factories through the implementor entry", () => {
		const connectorFactory = vi.fn(createRpcProtocolConnector);
		const acceptorFactory = vi.fn(createRpcProtocolAcceptor);
		const connectors = [
			createRpcConnector({ protocolFactory: connectorFactory }),
			createRpcConnector({ protocolFactory: connectorFactory }),
		];
		const acceptors = [
			createRpcAcceptor({ protocolFactory: acceptorFactory }),
			createRpcAcceptor({ protocolFactory: acceptorFactory }),
		];

		expect(connectorFactory).toHaveBeenCalledTimes(2);
		expect(acceptorFactory).toHaveBeenCalledTimes(2);
		expect(connectorFactory.mock.results[0]?.value).not.toBe(
			connectorFactory.mock.results[1]?.value,
		);
		expect(acceptorFactory.mock.results[0]?.value).not.toBe(
			acceptorFactory.mock.results[1]?.value,
		);
		expect(connectors.map((connector) => connector.state)).toEqual([
			{ status: "active" },
			{ status: "active" },
		]);
		expect(acceptors.map((acceptor) => acceptor.state.status)).toEqual([
			"active",
			"active",
		]);
	});

	it("RPC-PKG-004 RPC-PKG-005 keeps validation private and exposes portable package metadata", () => {
		expect(packageManifest).toMatchObject({
			type: "module",
			sideEffects: false,
			engines: { node: ">=23.6" },
			publishConfig: { access: "public" },
			files: [
				"dist",
				"docs/PROTOCOL.md",
				"docs/REQUIREMENTS.md",
				"docs/SPECIFICATION.md",
				"docs/TRANSPORT.md",
				"README.md",
				"CHANGELOG.md",
				"LICENSE",
			],
		});
		expect(Object.keys(packageManifest.exports)).not.toEqual(
			expect.arrayContaining([expect.stringMatching(/^\.\/wire\//u)]),
		);
	});

	it("RPC-API-001 RPC-SPI-001 constructs only the selected custom Protocol role", () => {
		const connectorHarness = createProtocolHarness();
		createRpcConnector({
			protocolFactory: connectorHarness.connectorFactory,
		});

		expect(connectorHarness.connectorHosts).toHaveLength(1);
		expect(connectorHarness.acceptorHosts).toHaveLength(0);
		expect(connectorHarness.calls).toEqual({
			connectorBind: 0,
			acceptorAccept: 0,
			shutdown: 0,
			close: 0,
			cleanup: 0,
		});

		const acceptorHarness = createProtocolHarness();
		createRpcAcceptor({ protocolFactory: acceptorHarness.acceptorFactory });

		expect(acceptorHarness.connectorHosts).toHaveLength(0);
		expect(acceptorHarness.acceptorHosts).toHaveLength(1);
		expect(acceptorHarness.calls).toEqual({
			connectorBind: 0,
			acceptorAccept: 0,
			shutdown: 0,
			close: 0,
			cleanup: 0,
		});
	});

	it("RPC-API-002 RPC-API-003 RPC-STATE-001 expose frozen cold Connector snapshots", () => {
		const { connectorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const ownerStates: unknown[] = [];
		const peerStates: unknown[] = [];

		connector.state$.subscribe((state) => ownerStates.push(state));
		connector.peer.state$.subscribe((state) => peerStates.push(state));

		expect(connector.state).toEqual({ status: "active" });
		expect(connector.peer.state).toEqual({ status: "unbound" });
		expect(ownerStates).toEqual([connector.state]);
		expect(peerStates).toEqual([connector.peer.state]);
		expect(Object.isFrozen(connector.state)).toBe(true);
		expect(Object.isFrozen(connector.peer.state)).toBe(true);
	});

	it("RPC-API-003 exposes frozen cold Acceptor state without replayed events", () => {
		const { acceptorFactory } = createProtocolHarness();
		const acceptor = createRpcAcceptor({ protocolFactory: acceptorFactory });
		const ownerStates: unknown[] = [];
		const memberships: unknown[] = [];
		const events: unknown[] = [];

		acceptor.state$.subscribe((state) => ownerStates.push(state));
		acceptor.peers$.subscribe((peers) => memberships.push(peers));
		acceptor.event$.subscribe((event) => events.push(event));

		const state = acceptor.state;
		expect(state).toEqual({
			status: "active",
			listener: { status: "idle" },
		});
		if (state.status !== "active") {
			throw new Error("A cold Acceptor must start active.");
		}
		expect(acceptor.peers).toEqual([]);
		expect(ownerStates).toEqual([state]);
		expect(memberships).toEqual([acceptor.peers]);
		expect(events).toEqual([]);
		expect(Object.isFrozen(state)).toBe(true);
		expect(Object.isFrozen(state.listener)).toBe(true);
		expect(Object.isFrozen(acceptor.peers)).toBe(true);
	});

	it("RPC-API-003 replays final state and membership snapshots to late subscribers", async () => {
		const { connectorFactory, acceptorFactory } = createProtocolHarness();
		const connector = createRpcConnector({
			protocolFactory: connectorFactory,
		});
		const acceptor = createRpcAcceptor({ protocolFactory: acceptorFactory });
		await Promise.all([connector.close(), acceptor.close()]);

		const observations: string[] = [];
		connector.state$.subscribe({
			next: (state) => observations.push(`connector:${state.status}`),
			complete: () => observations.push("connector-complete"),
		});
		connector.peer.state$.subscribe({
			next: (state) => observations.push(`connector-peer:${state.status}`),
			complete: () => observations.push("connector-peer-complete"),
		});
		acceptor.state$.subscribe({
			next: (state) => observations.push(`acceptor:${state.status}`),
			complete: () => observations.push("acceptor-complete"),
		});
		acceptor.peers$.subscribe({
			next: (peers) => observations.push(`acceptor-peers:${peers.length}`),
			complete: () => observations.push("acceptor-peers-complete"),
		});
		connector.event$.subscribe({
			next: (event) => observations.push(`connector-event:${event.type}`),
			complete: () => observations.push("connector-event-complete"),
		});
		acceptor.event$.subscribe({
			next: (event) => observations.push(`acceptor-event:${event.type}`),
			complete: () => observations.push("acceptor-event-complete"),
		});

		expect(observations).toEqual([
			"connector:closed",
			"connector-complete",
			"connector-peer:closed",
			"connector-peer-complete",
			"acceptor:closed",
			"acceptor-complete",
			"acceptor-peers:0",
			"acceptor-peers-complete",
			"connector-event-complete",
			"acceptor-event-complete",
		]);
	});
});
