/**
 * @overview RPC Topology Owner role-specific Publisher interface tests.
 * @author AEPKILL
 * @created 2026-09-04 12:00:00
 */

import { createServiceIdentifier } from "@husky-di/core";
import { describe, expect, it } from "vitest";

import { RpcCallDirectionEnum } from "../../src/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "../../src/enums/rpc-call-status.enum";
import { RpcCloseOutcomeEnum } from "../../src/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/enums/rpc-state-status.enum";
import { createRemoteServiceDescriptor } from "../../src/factories/remote-service-descriptor.factory";
import { createRpcPeer } from "../../src/factories/rpc-peer.factory";
import {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "../../src/impls/owner/rpc-owner-publisher.impl";
import type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "../../src/interfaces/owner/rpc-owner-publisher.interface";
import type { IRpcPeer } from "../../src/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerHost,
	RpcPeerStateView,
} from "../../src/interfaces/peer/rpc-peer-host.interface";
import type {
	RpcAcceptorState,
	RpcPeerState,
} from "../../src/types/common/rpc-caller.type";
import type { RpcEvent } from "../../src/types/owner/rpc-event.type";
import type { RpcPeerCallEvent } from "../../src/types/peer/rpc-peer-call-event.type";

describe("RPC Owner Publisher", () => {
	it("commits every Acceptor snapshot before ordered notifications and finishes streams last", () => {
		const publisher: IRpcAcceptorPublisher = new RpcAcceptorPublisherImpl({
			initialState: {
				status: RpcStateStatusEnum.active,
				listener: { status: RpcStateStatusEnum.idle },
			},
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.connected,
		}).peer;
		publisher.enqueue(() => ({ publication: { peers: [peer] } }));

		const order: string[] = [];
		let sessionRetained = true;
		const observeCommittedSnapshot = (source: string): void => {
			order.push(source);
			expect(publisher.state.status).toBe(RpcStateStatusEnum.closing);
			expect(publisher.peers).toEqual([]);
			expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
			expect(sessionRetained).toBe(false);
		};
		publisher.state$.subscribe({
			next: (state) => {
				if (state.status === RpcStateStatusEnum.closing) {
					observeCommittedSnapshot("owner-state");
				} else if (state.status === RpcStateStatusEnum.closed) {
					order.push("owner-closed");
				}
			},
			complete: () => order.push("owner-complete"),
		});
		publisher.peers$.subscribe({
			next: (peers) => {
				if (peers.length === 0) {
					observeCommittedSnapshot("peers");
				}
			},
			complete: () => order.push("peers-complete"),
		});
		peer.state$.subscribe({
			next: (state) => {
				if (state.status === RpcStateStatusEnum.closed) {
					observeCommittedSnapshot("peer-state");
				}
			},
			complete: () => order.push("peer-complete"),
		});
		publisher.event$.subscribe({
			next: (event) => {
				if (event.type === RpcEventTypeEnum.callFinished) {
					observeCommittedSnapshot("call-finished");
				} else {
					order.push(event.type);
				}
			},
			complete: () => order.push("event-complete"),
		});

		publisher.enqueue(() => ({
			publication: {
				state: { status: RpcStateStatusEnum.closing },
				peers: [],
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
				events: [
					{
						type: RpcEventTypeEnum.peerClosed,
						peer,
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					},
					{ type: RpcEventTypeEnum.ownerClosing },
				],
			},
			apply: (commitSnapshots) => {
				order.push("apply-before");
				expect(publisher.state.status).toBe(RpcStateStatusEnum.active);
				expect(publisher.peers).toEqual([peer]);
				expect(peer.state.status).toBe(RpcStateStatusEnum.connected);
				publisher.callEventSink({
					type: RpcEventTypeEnum.callFinished,
					observationId: "call-1",
					peer,
					direction: RpcCallDirectionEnum.outgoing,
					service: "example.publisher.v1",
					method: "run",
					outcome: RpcCallStatusEnum.rejected,
					code: RpcExceptionCodeEnum.outcomeUnknown,
					durationMs: 0,
				});
				sessionRetained = false;
				commitSnapshots();
				order.push("apply-after");
				expect(publisher.state.status).toBe(RpcStateStatusEnum.closing);
				expect(publisher.peers).toEqual([]);
				expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
				return () => order.push("continuation");
			},
		}));

		expect(order).toEqual([
			"apply-before",
			"apply-after",
			"call-finished",
			"owner-state",
			"peers",
			"peer-state",
			"peer-closed",
			"owner-closing",
			"peer-complete",
			"continuation",
		]);

		publisher.finish(
			{
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: RpcCloseReasonEnum.forcedClose,
			},
			() => order.push("settle"),
		);

		expect(order.slice(-6)).toEqual([
			"owner-closed",
			"owner-complete",
			"peers-complete",
			"topology-closed",
			"event-complete",
			"settle",
		]);

		const lateOrder: string[] = [];
		publisher.state$.subscribe({
			next: (state) => lateOrder.push(`owner:${state.status}`),
			complete: () => lateOrder.push("owner-complete"),
		});
		publisher.peers$.subscribe({
			next: (peers) => lateOrder.push(`peers:${peers.length}`),
			complete: () => lateOrder.push("peers-complete"),
		});
		peer.state$.subscribe({
			next: (state) => lateOrder.push(`peer:${state.status}`),
			complete: () => lateOrder.push("peer-complete"),
		});
		publisher.event$.subscribe({
			next: (event) => lateOrder.push(event.type),
			complete: () => lateOrder.push("event-complete"),
		});
		expect(lateOrder).toEqual([
			"owner:closed",
			"owner-complete",
			"peers:0",
			"peers-complete",
			"peer:closed",
			"peer-complete",
			"event-complete",
		]);
	});

	it("runs observer-enqueued operations before the current wave continuation", () => {
		const publisher: IRpcConnectorPublisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const order: string[] = [];

		publisher.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining) {
				order.push("owner-draining");
				for (let index = 0; index < 2; index += 1) {
					publisher.enqueue(() => {
						order.push(`observer-decision-${index}`);
						if (publisher.state.status !== RpcStateStatusEnum.draining) {
							return undefined;
						}
						return {
							publication: {
								state: { status: RpcStateStatusEnum.closing },
								events: [{ type: RpcEventTypeEnum.ownerClosing }],
							},
						};
					});
				}
			} else if (state.status === RpcStateStatusEnum.closing) {
				order.push("owner-closing");
			}
		});
		publisher.event$.subscribe((event) => order.push(event.type));

		publisher.enqueue(() => ({
			publication: {
				state: { status: RpcStateStatusEnum.draining },
				events: [{ type: RpcEventTypeEnum.ownerDraining }],
			},
			apply: (commitSnapshots) => {
				commitSnapshots();
				return () => order.push("initial-continuation");
			},
		}));

		expect(order).toEqual([
			"owner-draining",
			"owner-draining",
			"observer-decision-0",
			"owner-closing",
			"owner-closing",
			"observer-decision-1",
			"initial-continuation",
		]);
	});

	it("recovers after a producer throws and executes later enqueued work", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const marker = new Error("producer failed");
		const states: string[] = [];
		publisher.state$.subscribe((state) => states.push(state.status));

		expect(() =>
			publisher.enqueue(() => {
				throw marker;
			}),
		).toThrow(marker);

		publisher.enqueue(() => ({
			publication: { state: { status: RpcStateStatusEnum.draining } },
		}));

		expect(publisher.state.status).toBe(RpcStateStatusEnum.draining);
		expect(states).toEqual([
			RpcStateStatusEnum.active,
			RpcStateStatusEnum.draining,
		]);
	});

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

	it("keeps a caught double commit sticky and publishes its wave once", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const states: string[] = [];
		const events: RpcEvent[] = [];
		let caughtSecondCommit: unknown;
		let outerFailure: unknown;
		let continued = false;
		publisher.state$.subscribe((state) => states.push(state.status));
		publisher.event$.subscribe((event) => events.push(event));

		try {
			publisher.enqueue(() => ({
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					events: [{ type: RpcEventTypeEnum.ownerDraining }],
				},
				apply: (commitSnapshots) => {
					commitSnapshots();
					try {
						commitSnapshots();
					} catch (error) {
						caughtSecondCommit = error;
					}
					return () => {
						continued = true;
					};
				},
			}));
		} catch (error) {
			outerFailure = error;
		}

		expect(outerFailure).toBe(caughtSecondCommit);
		expect(outerFailure).toEqual(
			expect.objectContaining({
				message: "RPC snapshots were committed more than once.",
			}),
		);
		expect(publisher.state.status).toBe(RpcStateStatusEnum.draining);
		expect(states).toEqual([
			RpcStateStatusEnum.active,
			RpcStateStatusEnum.draining,
		]);
		expect(events).toEqual([{ type: RpcEventTypeEnum.ownerDraining }]);
		expect(continued).toBe(false);
	});

	it("permanently rejects an escaped snapshot token without changing state", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		let escapedCommit: (() => void) | undefined;
		const states: string[] = [];
		publisher.state$.subscribe((state) => states.push(state.status));

		publisher.enqueue(() => ({
			publication: { state: { status: RpcStateStatusEnum.draining } },
			apply: (commitSnapshots) => {
				escapedCommit = commitSnapshots;
				commitSnapshots();
				return undefined;
			},
		}));
		const committedState = publisher.state;
		if (escapedCommit === undefined) {
			throw new Error("Expected apply to expose its scoped commit token.");
		}
		const commitAfterScope = escapedCommit;

		expect(() => commitAfterScope()).toThrow(
			"RPC snapshot commit scope has ended.",
		);
		expect(() => commitAfterScope()).toThrow(
			"RPC snapshot commit scope has ended.",
		);
		expect(publisher.state).toBe(committedState);
		expect(states).toEqual([
			RpcStateStatusEnum.active,
			RpcStateStatusEnum.draining,
		]);
	});

	it("discards pre-token failures and their captured call events, then recovers", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const peer = registerTestPeer(publisher, {
			status: RpcStateStatusEnum.unbound,
		}).peer;
		const marker = new Error("apply failed before commit");
		const states: string[] = [];
		const events: RpcEvent[] = [];
		publisher.state$.subscribe((state) => states.push(state.status));
		publisher.event$.subscribe((event) => events.push(event));

		expect(() =>
			publisher.enqueue(() => ({
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					events: [{ type: RpcEventTypeEnum.ownerDraining }],
				},
				apply: () => {
					publisher.callEventSink(createCallEvent(peer, "discarded"));
					throw marker;
				},
			})),
		).toThrow(marker);
		expect(publisher.state.status).toBe(RpcStateStatusEnum.active);
		expect(states).toEqual([RpcStateStatusEnum.active]);
		expect(events).toEqual([]);

		publisher.enqueue(() => ({
			publication: {
				state: { status: RpcStateStatusEnum.draining },
				events: [{ type: RpcEventTypeEnum.ownerDraining }],
			},
		}));
		expect(states).toEqual([
			RpcStateStatusEnum.active,
			RpcStateStatusEnum.draining,
		]);
		expect(events).toEqual([{ type: RpcEventTypeEnum.ownerDraining }]);
	});

	it("flushes a committed failure and drains nested finish work before rethrowing", () => {
		const publisher = new RpcConnectorPublisherImpl({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const marker = new Error("apply failed after commit");
		const laterFailure = new Error("nested continuation failed");
		const order: string[] = [];
		publisher.state$.subscribe({
			next: (state) => {
				order.push(`state:${state.status}`);
				if (state.status === RpcStateStatusEnum.draining) {
					publisher.finish(
						{
							status: RpcStateStatusEnum.closed,
							outcome: RpcCloseOutcomeEnum.normal,
							reason: RpcCloseReasonEnum.forcedClose,
						},
						() => order.push("settle"),
					);
				}
			},
			complete: () => order.push("state:complete"),
		});
		publisher.event$.subscribe({
			next: (event) => order.push(`event:${event.type}`),
			complete: () => order.push("event:complete"),
		});
		let outerFailure: unknown;

		try {
			publisher.enqueue(() => ({
				publication: {
					state: { status: RpcStateStatusEnum.draining },
					events: [{ type: RpcEventTypeEnum.ownerDraining }],
				},
				apply: (commitSnapshots) => {
					order.push("failing-apply");
					publisher.enqueue(() => ({
						publication: {
							state: { status: RpcStateStatusEnum.closing },
							events: [{ type: RpcEventTypeEnum.ownerClosing }],
						},
						apply: (nestedCommit) => {
							order.push("nested-apply");
							nestedCommit();
							return () => {
								order.push("nested-continuation");
								throw laterFailure;
							};
						},
					}));
					commitSnapshots();
					throw marker;
				},
			}));
		} catch (error) {
			outerFailure = error;
		}

		expect(outerFailure).toBe(marker);
		expect(order).toEqual([
			`state:${RpcStateStatusEnum.active}`,
			"failing-apply",
			`state:${RpcStateStatusEnum.draining}`,
			`event:${RpcEventTypeEnum.ownerDraining}`,
			"nested-apply",
			`state:${RpcStateStatusEnum.closing}`,
			`event:${RpcEventTypeEnum.ownerClosing}`,
			`state:${RpcStateStatusEnum.closed}`,
			"state:complete",
			`event:${RpcEventTypeEnum.topologyClosed}`,
			"event:complete",
			"settle",
			"nested-continuation",
		]);
	});

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

interface IPublisherServiceContract {
	run(): void;
}

const IPublisherService =
	createServiceIdentifier<IPublisherServiceContract>("IPublisherService");

function createCallEvent(
	peer: IRpcPeer,
	observationId: string,
): RpcPeerCallEvent {
	return {
		type: RpcEventTypeEnum.callFinished,
		observationId,
		peer,
		direction: RpcCallDirectionEnum.outgoing,
		service: "example.publisher.v1",
		method: "run",
		outcome: RpcCallStatusEnum.rejected,
		code: RpcExceptionCodeEnum.outcomeUnknown,
		durationMs: 0,
	};
}

function registerTestPeer(
	publisher: Pick<IRpcConnectorPublisher, "registerPeer">,
	initialState: RpcPeerState,
): IRpcPeerHost {
	return publisher.registerPeer(initialState, createTestPeerHost);
}

function createTestPeerHost(stateView: RpcPeerStateView): IRpcPeerHost {
	const peer: IRpcPeer = {
		get state() {
			return stateView.readState();
		},
		state$: stateView.state$,
		expose: () => () => {},
		resolve: () => {
			throw new Error("The Publisher test Peer has no remote facade.");
		},
	};
	return Object.freeze({
		peer,
		reserveIncomingCall: () => false,
		hasLocalExposure: () => false,
	});
}
