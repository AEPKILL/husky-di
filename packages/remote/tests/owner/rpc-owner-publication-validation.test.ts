/**
 * @overview Verifies rpc owner publication validation.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import type { RpcAcceptorState, RpcEvent } from "../../src/modules/owner";
import {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "../../src/modules/owner";
import type {
	IRpcPeer,
	RpcPeerCallEvent,
	RpcPeerState,
} from "../../src/modules/peer";
import {
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
} from "../../src/modules/peer";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import { createCallEvent, registerTestPeer } from "./publisher/test.utils";

describe("RPC Owner Publisher", () => {
	it("copies publication inputs before apply effects can mutate them", () => {
		const publisher = new RpcAcceptorPublisherImpl({
			initialState: {
				status: RpcStateStatusEnum.active,
				listener: { status: RpcStateStatusEnum.idle },
			},
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.connected,
		}).peer;
		publisher.enqueue(() => ({ publication: { peers: [peer] } }));

		const mutableOwnerState: { status: RpcStateStatusEnum } = {
			status: RpcStateStatusEnum.closing,
		};
		const mutablePeers: IRpcPeer[] = [];
		const mutablePeerState: {
			status: RpcStateStatusEnum;
			outcome: RpcCloseOutcomeEnum;
			reason: RpcCloseReasonEnum;
		} = {
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.forcedClose,
		};
		const mutableEvent: {
			type: RpcEventTypeEnum;
			peer: IRpcPeer;
			outcome: RpcCloseOutcomeEnum;
			reason: RpcCloseReasonEnum;
		} = {
			type: RpcEventTypeEnum.peerClosed,
			peer,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.forcedClose,
		};
		const mutableEvents = [mutableEvent as RpcEvent];
		const callEvent: RpcPeerCallEvent = {
			type: RpcEventTypeEnum.callFinished,
			observationId: "mutable-call",
			peer,
			direction: RpcCallDirectionEnum.outgoing,
			service: "example.publisher.v1",
			method: "run",
			outcome: RpcCallStatusEnum.fulfilled,
			durationMs: 1,
		};
		const observedEvents: RpcEvent[] = [];
		publisher.event$.subscribe((event) => observedEvents.push(event));

		publisher.enqueue(() => ({
			publication: {
				state: mutableOwnerState as RpcAcceptorState,
				peers: mutablePeers,
				peerStates: [
					{
						peer,
						state: mutablePeerState as RpcPeerState,
						terminal: true,
					},
				],
				events: mutableEvents,
			},
			apply: (commitSnapshots) => {
				mutableOwnerState.status = RpcStateStatusEnum.active;
				mutablePeers.push(peer);
				mutablePeerState.status = RpcStateStatusEnum.connected;
				mutableEvent.type = RpcEventTypeEnum.ownerClosing;
				publisher.callEventSink(callEvent);
				(callEvent as { durationMs: number }).durationMs = 99;
				commitSnapshots();
				return undefined;
			},
		}));

		expect(publisher.state).toEqual({ status: RpcStateStatusEnum.closing });
		expect(publisher.state).not.toBe(mutableOwnerState);
		expect(Object.isFrozen(publisher.state)).toBe(true);
		expect(publisher.peers).toEqual([]);
		expect(publisher.peers).not.toBe(mutablePeers);
		expect(Object.isFrozen(publisher.peers)).toBe(true);
		expect(peer.state).toEqual({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason: RpcCloseReasonEnum.forcedClose,
		});
		expect(peer.state).not.toBe(mutablePeerState);
		expect(Object.isFrozen(peer.state)).toBe(true);
		expect(observedEvents).toHaveLength(2);
		expect(observedEvents[0]).toMatchObject({
			type: RpcEventTypeEnum.callFinished,
			durationMs: 1,
		});
		expect(observedEvents[1]).toMatchObject({
			type: RpcEventTypeEnum.peerClosed,
			peer,
		});
		expect(observedEvents[1]).not.toBe(mutableEvent);
		expect(observedEvents.every(Object.isFrozen)).toBe(true);
	});

	it("rejects unknown, duplicate, and completed Peers before apply runs", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.unbound,
		}).peer;
		const foreignPublisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const foreignPeer = registerTestPeer(foreignPublisher, {
			status: RpcStateStatusEnum.unbound,
		}).peer;
		let applies = 0;

		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{
							peer: foreignPeer,
							state: { status: RpcStateStatusEnum.connecting },
						},
					],
				},
				apply: (commitSnapshots) => {
					applies += 1;
					commitSnapshots();
					return undefined;
				},
			})),
		).toThrow("RPC Peer is not registered with this Publisher.");
		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{ peer, state: { status: RpcStateStatusEnum.connecting } },
						{ peer, state: { status: RpcStateStatusEnum.connected } },
					],
				},
				apply: (commitSnapshots) => {
					applies += 1;
					commitSnapshots();
					return undefined;
				},
			})),
		).toThrow("RPC Peer appears more than once in one publication.");

		publisher.enqueue(() => ({
			publication: {
				peerStates: [
					{
						peer,
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
		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{ peer, state: { status: RpcStateStatusEnum.connecting } },
					],
				},
				apply: (commitSnapshots) => {
					applies += 1;
					commitSnapshots();
					return undefined;
				},
			})),
		).toThrow("RPC Peer publication is already complete.");
		expect(applies).toBe(0);
	});

	it("validates membership and terminal markers before apply runs", () => {
		const publisher = new RpcAcceptorPublisherImpl({
			initialState: {
				status: RpcStateStatusEnum.active,
				listener: { status: RpcStateStatusEnum.idle },
			},
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.connected,
		}).peer;
		let applies = 0;
		const apply = (commitSnapshots: () => void): undefined => {
			applies += 1;
			commitSnapshots();
			return undefined;
		};

		expect(() =>
			publisher.enqueue(() => ({
				publication: { peers: [peer, peer] },
				apply,
			})),
		).toThrow("RPC Peer appears more than once in membership.");
		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peerStates: [
						{
							peer,
							state: {
								status: RpcStateStatusEnum.closed,
								outcome: RpcCloseOutcomeEnum.normal,
								reason: RpcCloseReasonEnum.forcedClose,
							},
						},
					],
				},
				apply,
			})),
		).toThrow("RPC Peer terminal marker must match its closed state.");
		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					peers: [peer],
					peerStates: [
						{
							peer,
							state: {
								status: RpcStateStatusEnum.closed,
								outcome: RpcCloseOutcomeEnum.normal,
								reason: RpcCloseReasonEnum.forcedClose,
							},
							terminal: true,
						},
					],
				},
				apply,
			})),
		).toThrow("Terminal RPC Peer cannot remain in membership.");
		expect(applies).toBe(0);
	});

	it("rejects a zero-commit apply without publishing its captured work", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.unbound,
		}).peer;
		const states: string[] = [];
		const events: RpcEvent[] = [];
		let continued = false;
		publisher.state$.subscribe((state) => states.push(state.status));
		publisher.event$.subscribe((event) => events.push(event));

		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					events: [{ type: RpcEventTypeEnum.ownerDraining }],
				},
				apply: () => {
					publisher.callEventSink(createCallEvent(peer, "zero-commit"));
					return () => {
						continued = true;
					};
				},
			})),
		).toThrow("RPC commit apply returned without committing snapshots.");
		expect(publisher.state).toEqual({ status: RpcStateStatusEnum.active });
		expect(states).toEqual([RpcStateStatusEnum.active]);
		expect(events).toEqual([]);
		expect(continued).toBe(false);

		publisher.enqueue(() => ({
			publication: { state: { status: RpcStateStatusEnum.draining } },
		}));
		expect(publisher.state.status).toBe(RpcStateStatusEnum.draining);
	});
});
