/**
 * @overview Acceptor atomic mutation-batch requirement tests.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it } from "vitest";

import {
	createRemoteServiceDescriptor,
	createRpcAcceptor,
	type IRpcAcceptor,
	type IRpcProtocol,
	type RpcEvent,
} from "../../src/index";
import type {
	IRpcProtocolAcceptorHost,
	IRpcProtocolInvocationSink,
	IRpcProtocolSession,
	IRpcProtocolSessionHost,
} from "../../src/protocol";

interface BatchService {
	wait(): Promise<string>;
}

const IBatchService = createServiceIdentifier<BatchService>("IBatchService");
const batchDescriptor = createRemoteServiceDescriptor(IBatchService, {
	wireName: "example.acceptor-batch.v1",
	methods: { wait: true },
});

interface AcceptorHarness {
	readonly acceptor: IRpcAcceptor;
	readonly host: IRpcProtocolAcceptorHost;
}

function createAcceptorHarness(
	options: {
		readonly shutdown?: () => Promise<void>;
		readonly close?: () => void;
	} = {},
): AcceptorHarness {
	let host: IRpcProtocolAcceptorHost | undefined;
	const protocol: IRpcProtocol = {
		createConnector() {
			throw new Error("Acceptor harness cannot create a Connector runtime.");
		},
		createAcceptor(nextHost) {
			host = nextHost;
			return {
				async accept() {},
				shutdown: options.shutdown ?? (() => Promise.resolve()),
				close: options.close ?? (() => {}),
				async cleanup() {},
			};
		},
	};
	const acceptor = createRpcAcceptor({ protocol });
	if (host === undefined) {
		throw new Error("Expected an Acceptor Protocol host.");
	}
	return { acceptor, host };
}

function admitEmptySession(
	host: IRpcProtocolAcceptorHost,
): IRpcProtocolSessionHost {
	const session: IRpcProtocolSession = {
		reserveInvocation: () => undefined,
		forceClose() {},
	};
	const sessionHost = host.admitSession(session);
	if (sessionHost === undefined) {
		throw new Error("Expected the Acceptor Session to be admitted.");
	}
	return sessionHost;
}

describe("Acceptor mutation batches", () => {
	it("RPC-API-005 commits peer terminal state and membership before terminal observers", async () => {
		const { acceptor, host } = createAcceptorHarness();
		const sessionHost = admitEmptySession(host);
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Acceptor peer.");
		}
		const observations: {
			readonly source: "peer-state" | "peers" | "event";
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly memberCount: number;
			readonly peerRetained: boolean;
		}[] = [];
		const observe = (source: "peer-state" | "peers" | "event"): void => {
			observations.push({
				source,
				ownerStatus: acceptor.state.status,
				peerStatus: peer.state.status,
				memberCount: acceptor.peers.length,
				peerRetained: acceptor.peers.includes(peer),
			});
		};
		peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("peer-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (!peers.includes(peer)) {
				observe("peers");
			}
		});
		acceptor.event$.subscribe((event: RpcEvent) => {
			if (event.type === "peer-closed") {
				observe("event");
			}
		});

		sessionHost.transition({
			type: "closed",
			reason: "remote-terminated",
		});

		expect(observations).toEqual([
			{
				source: "peer-state",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
			{
				source: "peers",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
			{
				source: "event",
				ownerStatus: "active",
				peerStatus: "closed",
				memberCount: 0,
				peerRetained: false,
			},
		]);
		await acceptor.close();
	});

	it("RPC-API-005 commits the full G snapshot before call, state, membership, and lifecycle observers", async () => {
		let resolveShutdown!: () => void;
		const { acceptor, host } = createAcceptorHarness({
			shutdown: () =>
				new Promise<void>((resolve) => {
					resolveShutdown = resolve;
				}),
		});
		admitEmptySession(host);
		let invocationSink: IRpcProtocolInvocationSink | undefined;
		const recoveringSession: IRpcProtocolSession = {
			reserveInvocation() {
				return {
					commit(sink) {
						invocationSink = sink;
						return { start() {}, cancel() {} };
					},
					release() {},
				};
			},
			forceClose() {
				invocationSink?.finish({
					type: "failed",
					code: "outcome-unknown",
				});
			},
		};
		const recoveringHost = host.admitSession(recoveringSession);
		const [drainingPeer, recoveringPeer] = acceptor.peers;
		if (
			recoveringHost === undefined ||
			drainingPeer === undefined ||
			recoveringPeer === undefined
		) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		recoveringHost.transition({ type: "recovering" });

		const observations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly memberCount: number;
			readonly drainingStatus: string;
			readonly recoveringStatus: string;
			readonly recoveringRetained: boolean;
			readonly callSettled: boolean;
		}[] = [];
		let callSettled = false;
		const observe = (source: string): void => {
			observations.push({
				source,
				ownerStatus: acceptor.state.status,
				memberCount: acceptor.peers.length,
				drainingStatus: drainingPeer.state.status,
				recoveringStatus: recoveringPeer.state.status,
				recoveringRetained: acceptor.peers.includes(recoveringPeer),
				callSettled,
			});
		};
		acceptor.state$.subscribe((state) => {
			if (state.status === "draining") {
				observe("owner-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 1) {
				observe("peers");
			}
		});
		drainingPeer.state$.subscribe((state) => {
			if (state.status === "draining") {
				observe("draining-peer-state");
			}
		});
		recoveringPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("recovering-peer-state");
			}
		});
		const eventOrder: string[] = [];
		acceptor.event$.subscribe((event) => {
			if (
				event.type === "call-finished" ||
				event.type === "owner-draining" ||
				event.type === "peer-draining" ||
				event.type === "peer-closed"
			) {
				eventOrder.push(event.type);
				observe(event.type);
			}
		});
		const callOutcome = recoveringPeer
			.resolve(batchDescriptor)
			.wait()
			.then(
				() => undefined,
				(error: unknown) => {
					callSettled = true;
					return error;
				},
			);

		const shutdownTask = acceptor.shutdown();

		const expectedSnapshot = {
			ownerStatus: "draining",
			memberCount: 1,
			drainingStatus: "draining",
			recoveringStatus: "closed",
			recoveringRetained: false,
			callSettled: false,
		};
		expect(observations).toEqual([
			{ source: "call-finished", ...expectedSnapshot },
			{ source: "owner-state", ...expectedSnapshot },
			{ source: "peers", ...expectedSnapshot },
			{ source: "draining-peer-state", ...expectedSnapshot },
			{ source: "recovering-peer-state", ...expectedSnapshot },
			{ source: "owner-draining", ...expectedSnapshot },
			{ source: "peer-draining", ...expectedSnapshot },
			{ source: "peer-closed", ...expectedSnapshot },
		]);
		expect(eventOrder).toEqual([
			"call-finished",
			"owner-draining",
			"peer-draining",
			"peer-closed",
		]);
		await expect(callOutcome).resolves.toMatchObject({
			code: "outcome-unknown",
		});

		resolveShutdown();
		await shutdownTask;
	});

	it("RPC-API-005 commits the full F snapshot before notifications and settles the close task last", async () => {
		let invocationSink: IRpcProtocolInvocationSink | undefined;
		const { acceptor, host } = createAcceptorHarness({
			close: () => {
				invocationSink?.finish({
					type: "failed",
					code: "outcome-unknown",
				});
			},
		});
		const session: IRpcProtocolSession = {
			reserveInvocation() {
				return {
					commit(sink) {
						invocationSink = sink;
						return { start() {}, cancel() {} };
					},
					release() {},
				};
			},
			forceClose() {},
		};
		if (host.admitSession(session) === undefined) {
			throw new Error("Expected the Acceptor Session to be admitted.");
		}
		const peer = acceptor.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Acceptor peer.");
		}

		let callSettled = false;
		let closeSettled = false;
		const order: string[] = [];
		const closingObservations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly peerStatus: string;
			readonly memberCount: number;
			readonly callSettled: boolean;
			readonly closeSettled: boolean;
		}[] = [];
		const observeClosing = (source: string): void => {
			closingObservations.push({
				source,
				ownerStatus: acceptor.state.status,
				peerStatus: peer.state.status,
				memberCount: acceptor.peers.length,
				callSettled,
				closeSettled,
			});
		};
		let finalStateObservation:
			| {
					readonly ownerStatus: string;
					readonly peerStatus: string;
					readonly memberCount: number;
					readonly closeSettled: boolean;
			  }
			| undefined;
		acceptor.state$.subscribe((state) => {
			if (state.status === "closing") {
				observeClosing("owner-state");
			} else if (state.status === "closed") {
				finalStateObservation = {
					ownerStatus: acceptor.state.status,
					peerStatus: peer.state.status,
					memberCount: acceptor.peers.length,
					closeSettled,
				};
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 0) {
				observeClosing("peers");
			}
		});
		peer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observeClosing("peer-state");
			}
		});
		let topologyObservation:
			| {
					readonly ownerStatus: string;
					readonly peerStatus: string;
					readonly memberCount: number;
					readonly closeSettled: boolean;
			  }
			| undefined;
		acceptor.event$.subscribe((event) => {
			if (
				event.type === "call-finished" ||
				event.type === "peer-closed" ||
				event.type === "owner-closing"
			) {
				order.push(event.type);
				observeClosing(event.type);
			} else if (event.type === "topology-closed") {
				order.push(event.type);
				topologyObservation = {
					ownerStatus: acceptor.state.status,
					peerStatus: peer.state.status,
					memberCount: acceptor.peers.length,
					closeSettled,
				};
			}
		});
		const callOutcome = peer
			.resolve(batchDescriptor)
			.wait()
			.then(
				() => undefined,
				(error: unknown) => {
					callSettled = true;
					order.push("call-promise");
					return error;
				},
			);

		const closeOutcome = acceptor.close().then(() => {
			closeSettled = true;
			order.push("close-promise");
		});

		const expectedClosingSnapshot = {
			ownerStatus: "closing",
			peerStatus: "closed",
			memberCount: 0,
			callSettled: false,
			closeSettled: false,
		};
		expect(closingObservations).toEqual([
			{ source: "call-finished", ...expectedClosingSnapshot },
			{ source: "owner-state", ...expectedClosingSnapshot },
			{ source: "peers", ...expectedClosingSnapshot },
			{ source: "peer-state", ...expectedClosingSnapshot },
			{ source: "peer-closed", ...expectedClosingSnapshot },
			{ source: "owner-closing", ...expectedClosingSnapshot },
		]);
		await expect(callOutcome).resolves.toMatchObject({
			code: "outcome-unknown",
		});
		await closeOutcome;

		expect(finalStateObservation).toEqual({
			ownerStatus: "closed",
			peerStatus: "closed",
			memberCount: 0,
			closeSettled: false,
		});
		expect(topologyObservation).toEqual({
			ownerStatus: "closed",
			peerStatus: "closed",
			memberCount: 0,
			closeSettled: false,
		});
		expect(order.indexOf("call-finished")).toBeLessThan(
			order.indexOf("peer-closed"),
		);
		expect(order.indexOf("peer-closed")).toBeLessThan(
			order.indexOf("topology-closed"),
		);
		expect(order.indexOf("peer-closed")).toBeLessThan(
			order.indexOf("call-promise"),
		);
		expect(order.indexOf("topology-closed")).toBeLessThan(
			order.indexOf("close-promise"),
		);
	});

	it("RPC-API-005 RPC-SPI-011 batches a shared owner fault after closing the runtime", async () => {
		let acceptorDuringRuntimeClose:
			| {
					readonly ownerStatus: string;
					readonly memberCount: number;
			  }
			| undefined;
		let acceptor: IRpcAcceptor | undefined;
		const harness = createAcceptorHarness({
			close: () => {
				acceptorDuringRuntimeClose = {
					ownerStatus: acceptor?.state.status ?? "missing",
					memberCount: acceptor?.peers.length ?? -1,
				};
			},
		});
		acceptor = harness.acceptor;
		admitEmptySession(harness.host);
		admitEmptySession(harness.host);
		const [firstPeer, secondPeer] = acceptor.peers;
		if (firstPeer === undefined || secondPeer === undefined) {
			throw new Error("Expected two admitted Acceptor peers.");
		}
		const observations: {
			readonly source: string;
			readonly ownerStatus: string;
			readonly memberCount: number;
			readonly firstPeerStatus: string;
			readonly secondPeerStatus: string;
		}[] = [];
		const observe = (source: string): void => {
			observations.push({
				source,
				ownerStatus: acceptor?.state.status ?? "missing",
				memberCount: acceptor?.peers.length ?? -1,
				firstPeerStatus: firstPeer.state.status,
				secondPeerStatus: secondPeer.state.status,
			});
		};
		acceptor.state$.subscribe((state) => {
			if (state.status === "closing") {
				observe("owner-state");
			}
		});
		acceptor.peers$.subscribe((peers) => {
			if (peers.length === 0) {
				observe("peers");
			}
		});
		firstPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("first-peer-state");
			}
		});
		secondPeer.state$.subscribe((state) => {
			if (state.status === "closed") {
				observe("second-peer-state");
			}
		});
		acceptor.event$.subscribe((event) => {
			if (event.type === "peer-closed") {
				observe(
					event.peer === firstPeer ? "first-peer-closed" : "second-peer-closed",
				);
			} else if (event.type === "owner-closing") {
				observe("owner-closing");
			}
		});

		harness.host.fault("protocol-fault", new Error("shared fault"));

		expect(acceptorDuringRuntimeClose).toEqual({
			ownerStatus: "active",
			memberCount: 2,
		});
		const expectedSnapshot = {
			ownerStatus: "closing",
			memberCount: 0,
			firstPeerStatus: "closed",
			secondPeerStatus: "closed",
		};
		expect(observations).toEqual([
			{ source: "owner-state", ...expectedSnapshot },
			{ source: "peers", ...expectedSnapshot },
			{ source: "first-peer-state", ...expectedSnapshot },
			{ source: "second-peer-state", ...expectedSnapshot },
			{ source: "first-peer-closed", ...expectedSnapshot },
			{ source: "second-peer-closed", ...expectedSnapshot },
			{ source: "owner-closing", ...expectedSnapshot },
		]);
		await acceptor.close();
	});
});
