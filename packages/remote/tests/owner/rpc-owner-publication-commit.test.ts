/**
 * @overview Verifies rpc owner publication commit.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import type { RpcEvent } from "../../src/modules/owner";
import { RpcConnectorPublisherImpl } from "../../src/modules/owner";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import { createCallEvent, registerTestPeer } from "./publisher/test.utils";

describe("RPC Owner Publisher", () => {
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
});
