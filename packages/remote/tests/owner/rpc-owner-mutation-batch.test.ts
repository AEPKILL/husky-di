/**
 * @overview RPC Topology Owner mutation-batch interface tests.
 * @author AEPKILL
 * @created 2026-08-30 14:43:57
 */

import { describe, expect, it } from "vitest";

import { RpcCallDirectionEnum } from "../../src/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "../../src/enums/rpc-call-status.enum";
import { RpcCloseOutcomeEnum } from "../../src/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/enums/rpc-state-status.enum";
import { RpcOwnerMutationBatchImpl } from "../../src/impls/owner/rpc-owner-mutation-batch.impl";
import { RpcPeerImpl } from "../../src/impls/peer/rpc-peer.impl";
import type { IRpcOwnerMutationBatch } from "../../src/interfaces/owner/rpc-owner-mutation-batch.interface";
import type { RpcConnectorState } from "../../src/types/common/rpc-caller.type";

describe("RPC Owner mutation batch", () => {
	it("commits every snapshot before ordered notifications and finishes streams last", () => {
		let mutationBatch!: IRpcOwnerMutationBatch<RpcConnectorState>;
		const peer = new RpcPeerImpl({
			initialState: { status: RpcStateStatusEnum.connected },
			ownerExposureRegistry: new Map(),
			isOwnerActive: () => true,
			emitEvent: (event) => mutationBatch.emitCallEvent(event),
			onProtocolFault() {},
			handlerScheduler: { enqueue: () => () => {} },
			maximumIncomingBytes: 1,
			reserveRetainedBytes: () => undefined,
		});
		mutationBatch = new RpcOwnerMutationBatchImpl<RpcConnectorState>({
			initialState: { status: RpcStateStatusEnum.active },
			initialMembership: [peer],
		});

		const order: string[] = [];
		let roleSessionRetained = true;
		const observeCommittedSnapshot = (source: string): void => {
			order.push(source);
			expect(mutationBatch.state.status).toBe(RpcStateStatusEnum.closing);
			expect(mutationBatch.membership).toEqual([]);
			expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
			expect(roleSessionRetained).toBe(false);
		};
		mutationBatch.state$.subscribe({
			next: (state) => {
				if (state.status === RpcStateStatusEnum.closing) {
					observeCommittedSnapshot("owner-state");
				} else if (state.status === RpcStateStatusEnum.closed) {
					order.push("owner-closed");
				}
			},
			complete: () => order.push("owner-complete"),
		});
		mutationBatch.membership$.subscribe({
			next: (membership) => {
				if (membership.length === 0) {
					observeCommittedSnapshot("membership");
				}
			},
			complete: () => order.push("membership-complete"),
		});
		peer.state$.subscribe({
			next: (state) => {
				if (state.status === RpcStateStatusEnum.closed) {
					observeCommittedSnapshot("peer-state");
				}
			},
			complete: () => order.push("peer-complete"),
		});
		mutationBatch.event$.subscribe({
			next: (event) => {
				if (event.type === RpcEventTypeEnum.callFinished) {
					observeCommittedSnapshot("call-finished");
				} else {
					order.push(event.type);
				}
			},
			complete: () => order.push("event-complete"),
		});

		mutationBatch.mutate(() => ({
			ownerState: { status: RpcStateStatusEnum.closing },
			membership: [],
			peerMutations: [
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
			beforeSnapshotCommit: () => {
				order.push("before-snapshot");
				expect(mutationBatch.state.status).toBe(RpcStateStatusEnum.active);
				expect(mutationBatch.membership).toEqual([peer]);
				expect(peer.state.status).toBe(RpcStateStatusEnum.connected);
				mutationBatch.emitCallEvent({
					type: RpcEventTypeEnum.callFinished,
					observationId: "call-1",
					peer,
					direction: RpcCallDirectionEnum.outgoing,
					service: "example.batch.v1",
					method: "run",
					outcome: RpcCallStatusEnum.rejected,
					code: RpcExceptionCodeEnum.outcomeUnknown,
					durationMs: 0,
				});
			},
			commitFacts: () => {
				order.push("commit-facts");
				roleSessionRetained = false;
			},
			afterSnapshotCommit: () => {
				order.push("after-snapshot");
				expect(mutationBatch.state.status).toBe(RpcStateStatusEnum.closing);
				expect(mutationBatch.membership).toEqual([]);
				expect(peer.state.status).toBe(RpcStateStatusEnum.closed);
			},
			events: [
				{
					type: RpcEventTypeEnum.peerClosed,
					peer,
					outcome: RpcCloseOutcomeEnum.normal,
					reason: RpcCloseReasonEnum.forcedClose,
				},
				{ type: RpcEventTypeEnum.ownerClosing },
			],
			afterNotifications: () => order.push("after-notifications"),
		}));

		expect(order).toEqual([
			"before-snapshot",
			"commit-facts",
			"after-snapshot",
			"call-finished",
			"owner-state",
			"membership",
			"peer-state",
			"peer-closed",
			"owner-closing",
			"peer-complete",
			"after-notifications",
		]);

		mutationBatch.finish({
			ownerState: {
				status: RpcStateStatusEnum.closed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: RpcCloseReasonEnum.forcedClose,
			},
			event: {
				type: RpcEventTypeEnum.topologyClosed,
				outcome: RpcCloseOutcomeEnum.normal,
				reason: RpcCloseReasonEnum.forcedClose,
			},
			afterCompletion: () => order.push("after-completion"),
		});

		expect(order.slice(-6)).toEqual([
			"owner-closed",
			"owner-complete",
			"membership-complete",
			"topology-closed",
			"event-complete",
			"after-completion",
		]);

		const lateOrder: string[] = [];
		mutationBatch.state$.subscribe({
			next: (state) => lateOrder.push(`owner:${state.status}`),
			complete: () => lateOrder.push("owner-complete"),
		});
		mutationBatch.membership$.subscribe({
			next: (membership) => lateOrder.push(`membership:${membership.length}`),
			complete: () => lateOrder.push("membership-complete"),
		});
		peer.state$.subscribe({
			next: (state) => lateOrder.push(`peer:${state.status}`),
			complete: () => lateOrder.push("peer-complete"),
		});
		mutationBatch.event$.subscribe({
			next: (event) => lateOrder.push(event.type),
			complete: () => lateOrder.push("event-complete"),
		});
		expect(lateOrder).toEqual([
			"owner:closed",
			"owner-complete",
			"membership:0",
			"membership-complete",
			"peer:closed",
			"peer-complete",
			"event-complete",
		]);
	});

	it("serializes reentrant mutations after the current notification wave", () => {
		const mutationBatch = new RpcOwnerMutationBatchImpl<RpcConnectorState>({
			initialState: { status: RpcStateStatusEnum.active },
		});
		const order: string[] = [];

		mutationBatch.state$.subscribe((state) => {
			if (state.status === RpcStateStatusEnum.draining) {
				order.push("first-owner-draining");
				for (let index = 0; index < 2; index += 1) {
					mutationBatch.mutate(() => {
						if (mutationBatch.state.status !== RpcStateStatusEnum.draining) {
							return undefined;
						}
						return {
							ownerState: { status: RpcStateStatusEnum.closing },
							events: [{ type: RpcEventTypeEnum.ownerClosing }],
						};
					});
				}
			} else if (state.status === RpcStateStatusEnum.closing) {
				order.push("first-owner-closing");
			}
		});
		mutationBatch.state$.subscribe((state) => {
			if (
				state.status === RpcStateStatusEnum.draining ||
				state.status === RpcStateStatusEnum.closing
			) {
				expect(mutationBatch.state).toBe(state);
				order.push(`second-owner-${state.status}`);
			}
		});
		mutationBatch.event$.subscribe((event) => order.push(event.type));

		mutationBatch.mutate(() => ({
			ownerState: { status: RpcStateStatusEnum.draining },
			events: [{ type: RpcEventTypeEnum.ownerDraining }],
		}));

		expect(order).toEqual([
			"first-owner-draining",
			"second-owner-draining",
			"owner-draining",
			"first-owner-closing",
			"second-owner-closing",
			"owner-closing",
		]);
	});
});
