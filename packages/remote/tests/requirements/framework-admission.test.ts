/**
 * @overview Verifies framework admission.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import { createRpcAcceptor, createRpcConnector } from "../../src/index";
import type { IRpcProtocolSession } from "../../src/protocol";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/protocol";
import {
	createAcceptorHarness,
	createConnectorHarness,
	createEmptySession,
	requirementDescriptor,
} from "./framework/test.utils";

describe("Framework requirement evidence", () => {
	it("RPC-CALL-004 applies control, abort, availability, value, then capacity preflight without observations", async () => {
		const unbound = createRpcConnector();
		const cancel = unbound.peer.resolve(requirementDescriptor)
			.cancel as unknown as (...args: unknown[]) => Promise<unknown>;
		await expect(cancel()).rejects.toBeInstanceOf(TypeError);
		const aborted = new AbortController();
		aborted.abort();
		await expect(cancel(new Map(), aborted.signal)).rejects.toMatchObject({
			code: "canceled",
		});
		await expect(
			unbound.peer.resolve(requirementDescriptor).echo(new Map() as never),
		).rejects.toMatchObject({ code: "unavailable" });
		await unbound.close();

		let reservationCalls = 0;
		const session: IRpcProtocolSession = {
			prepareInvocation() {
				reservationCalls += 1;
				return undefined;
			},
			forceClose() {},
		};
		const harness = createConnectorHarness({ session });
		await harness.connect();
		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo(new Map() as never),
		).rejects.toBeInstanceOf(TypeError);
		expect(reservationCalls).toBe(0);
		await expect(
			harness.connector.peer
				.resolve(requirementDescriptor)
				.echo({ secret: "valid" }),
		).rejects.toMatchObject({ code: "unavailable" });
		expect(reservationCalls).toBe(1);
		expect(
			harness.events.filter(
				(event) =>
					event.type === "call-started" || event.type === "call-finished",
			),
		).toEqual([]);
		await harness.connector.close();
	});

	it("RPC-START-001 gates before Adapter inspection and reports shape failures only by Promise rejection", async () => {
		const closedConnector = createRpcConnector();
		await closedConnector.close();
		let connectorSourceReads = 0;
		const gatedConnectorAdapter = Object.defineProperty({}, "connection$", {
			get() {
				connectorSourceReads += 1;
				throw new Error("must not inspect gated Adapter");
			},
		});
		let gatedConnectorTask: Promise<void> | undefined;
		expect(() => {
			gatedConnectorTask = closedConnector.connect({
				adapter: gatedConnectorAdapter as never,
			});
		}).not.toThrow();
		await expect(gatedConnectorTask).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(connectorSourceReads).toBe(0);

		const connector = createRpcConnector();
		let invalidConnectorTask: Promise<void> | undefined;
		expect(() => {
			invalidConnectorTask = connector.connect({ adapter: {} as never });
		}).not.toThrow();
		await expect(invalidConnectorTask).rejects.toBeInstanceOf(TypeError);
		await connector.close();

		const closedAcceptor = createRpcAcceptor();
		await closedAcceptor.close();
		let acceptorSourceReads = 0;
		const gatedAcceptorAdapter = Object.defineProperty({}, "connection$", {
			get() {
				acceptorSourceReads += 1;
				throw new Error("must not inspect gated Adapter");
			},
		});
		let gatedAcceptorTask: Promise<void> | undefined;
		expect(() => {
			gatedAcceptorTask = closedAcceptor.listen(gatedAcceptorAdapter as never);
		}).not.toThrow();
		await expect(gatedAcceptorTask).rejects.toMatchObject({
			code: "unavailable",
		});
		expect(acceptorSourceReads).toBe(0);

		const acceptor = createRpcAcceptor();
		let invalidAcceptorTask: Promise<void> | undefined;
		expect(() => {
			invalidAcceptorTask = acceptor.listen({} as never);
		}).not.toThrow();
		await expect(invalidAcceptorTask).rejects.toBeInstanceOf(TypeError);
		await acceptor.close();
	});

	it("RPC-SPI-009 retains Connector identity and rejects Acceptor admission before publishing excess peers", async () => {
		const connectorHarness = createConnectorHarness();
		const stablePeer = connectorHarness.connector.peer;
		const sessionHost = await connectorHarness.connect();
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		sessionHost.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(connectorHarness.connector.peer).toBe(stablePeer);
		expect(
			connectorHarness.host.attachSession(createEmptySession()),
		).toBeUndefined();

		const { acceptor, host } = createAcceptorHarness();
		const firstSession = createEmptySession();
		const firstHost = host.admitSession(firstSession);
		expect(firstHost).toBeDefined();
		const firstPeer = acceptor.peers[0];
		firstHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovering,
		});
		firstHost?.transition({
			type: RpcProtocolSessionTransitionTypeEnum.recovered,
		});
		expect(acceptor.peers[0]).toBe(firstPeer);
		expect(host.admitSession(firstSession)).toBeUndefined();
		for (let index = 1; index < 64; index += 1) {
			expect(host.admitSession(createEmptySession())).toBeDefined();
		}
		expect(acceptor.peers).toHaveLength(64);
		expect(host.admitSession(createEmptySession())).toBeUndefined();
		expect(acceptor.peers).toHaveLength(64);
		await Promise.all([connectorHarness.connector.close(), acceptor.close()]);
	});
});
