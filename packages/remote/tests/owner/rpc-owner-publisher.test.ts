/**
 * @overview Verifies rpc owner publisher.
 * @author AEPKILL
 * @created 2026-09-04 12:00:00
 */

import { describe, expect, it } from "vitest";
import type {
	IRpcAcceptorPublisher,
	IRpcConnectorPublisher,
} from "../../src/modules/owner";
import {
	RpcAcceptorPublisherImpl,
	RpcConnectorPublisherImpl,
} from "../../src/modules/owner";
import {
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
} from "../../src/modules/peer";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import { registerTestPeer } from "./publisher/test.utils";

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
});
