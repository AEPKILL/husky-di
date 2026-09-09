/**
 * @overview Verifies rpc owner peer registration.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "../../src/modules/owner";
import type { IRpcPeer, RpcPeerState } from "../../src/modules/peer";
import {
	createRemoteServiceDescriptor,
	createRpcPeer,
} from "../../src/modules/peer";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import {
	createTestPeerHost,
	IPublisherService,
	registerTestPeer,
} from "./publisher/test.utils";

describe("RPC Owner Publisher", () => {
	it("completes a failed Peer build without registering its temporary identity", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const marker = new Error("Peer build failed");
		let abandonedPeer: IRpcPeer | undefined;
		const observations: string[] = [];

		expect(() =>
			publisher.registerPeer(
				{ status: RpcStateStatusEnum.unbound },
				(stateView) => {
					stateView.state$.subscribe({
						next: (state) => observations.push(state.status),
						complete: () => observations.push("complete"),
					});
					abandonedPeer = createTestPeerHost(stateView).peer;
					throw marker;
				},
			),
		).toThrow(marker);
		expect(observations).toEqual([RpcStateStatusEnum.unbound, "complete"]);
		if (abandonedPeer === undefined) {
			throw new Error("Expected the failed builder to create a Peer identity.");
		}

		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{
							peer: abandonedPeer as IRpcPeer,
							state: { status: RpcStateStatusEnum.connecting },
						},
					],
				},
			})),
		).toThrow("RPC Peer is not registered with this Publisher.");
	});

	it("rejects stale Peer registration before invoking its builder", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		publisher.finish(
			{
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: RpcCloseReasonEnum.forcedClose,
			},
			() => {},
		);
		let builds = 0;

		expect(() =>
			publisher.registerPeer(
				{ status: RpcStateStatusEnum.unbound },
				(stateView) => {
					builds += 1;
					return createTestPeerHost(stateView);
				},
			),
		).toThrow("Cannot register an RPC Peer with a finished Publisher.");
		expect(builds).toBe(0);
	});

	it("rejects duplicate Peer commits before changing its registered snapshot", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.unbound,
		}).peer;
		const states: RpcPeerState[] = [];
		peer.state$.subscribe((state) => states.push(state));

		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{ peer, state: { status: RpcStateStatusEnum.connecting } },
						{ peer, state: { status: RpcStateStatusEnum.connected } },
					],
				},
			})),
		).toThrow("RPC Peer appears more than once in one publication.");
		expect(peer.state).toEqual({ status: RpcStateStatusEnum.unbound });
		expect(states).toEqual([{ status: RpcStateStatusEnum.unbound }]);
	});

	it("keeps one canonical Peer identity and clears its local exposures at terminal completion", () => {
		const publisher = new RpcAcceptorPublisherImpl({
			initialState: {
				status: RpcStateStatusEnum.active,
				listener: { status: RpcStateStatusEnum.idle },
			},
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
					callEventSink: publisher.callEventSink,
					onProtocolFault() {},
					handlerScheduler: { enqueue: () => () => {} },
					maximumIncomingBytes: 1,
					reserveRetainedBytes: () => undefined,
				}),
		);
		const descriptor = createRemoteServiceDescriptor(IPublisherService, {
			wireName: "example.publisher.v1",
			methods: { run: true },
		});
		host.peer.expose(descriptor, { run() {} });
		expect(host.hasLocalExposure("example.publisher.v1")).toBe(true);

		let openedPeer: IRpcPeer | undefined;
		publisher.event$.subscribe((event) => {
			if (event.type === RpcEventTypeEnum.peerOpened) {
				openedPeer = event.peer;
			}
		});
		publisher.enqueue(() => ({
			publication: {
				peers: [host.peer],
				events: [{ type: RpcEventTypeEnum.peerOpened, peer: host.peer }],
			},
		}));
		expect(publisher.peers[0]).toBe(host.peer);
		expect(openedPeer).toBe(host.peer);

		publisher.enqueue(() => ({
			publication: {
				peers: [],
				peerStates: [
					{
						peer: host.peer,
						state: {
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.normal,
							reason: RpcCloseReasonEnum.forcedClose,
						},
						terminal: true,
					},
				],
			},
		}));
		expect(host.hasLocalExposure("example.publisher.v1")).toBe(false);
	});

	it("does not expose Acceptor-only runtime roles on a Connector Publisher", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});

		expect("processing" in publisher).toBe(false);
		expect("busy" in publisher).toBe(false);
		expect("peers" in publisher).toBe(false);
		expect("peers$" in publisher).toBe(false);
		expect("membership" in publisher).toBe(false);
		expect("membership$" in publisher).toBe(false);
	});
});
