/**
 * @overview Verifies rpc session transition.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it, vi } from "vitest";
import type { RpcEvent } from "../../src/modules/owner";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import {
	admitAcceptor,
	createAcceptorHarness,
	createSession,
	publishAcceptorState,
	publishPeerState,
} from "./ownership/test.utils";
import {
	invalidTransitionCases,
	nonterminalProjectionCases,
	validTransitionCases,
} from "./ownership/transitions/test.utils";

describe("transition policy through the Acceptor ownership adapter", () => {
	it.each(validTransitionCases)("accepts $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const harness = createAcceptorHarness();
		const forceClose = vi.fn();
		const host = admitAcceptor(harness, createSession(forceClose));
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);
		if (ownerStatus === RpcStateStatusEnum.draining) {
			publishAcceptorState(harness.publisher, {
				status: RpcStateStatusEnum.draining,
			});
		}

		host.transition(transition);

		expect(forceClose).not.toHaveBeenCalled();
	});

	it.each(invalidTransitionCases)("faults $name", ({
		ownerStatus,
		peerState,
		transition,
	}) => {
		const harness = createAcceptorHarness();
		const forceClose = vi.fn();
		const host = admitAcceptor(harness, createSession(forceClose));
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);
		if (ownerStatus === RpcStateStatusEnum.draining) {
			publishAcceptorState(harness.publisher, {
				status: RpcStateStatusEnum.draining,
			});
		}

		host.transition(transition);

		expect(forceClose).toHaveBeenCalledOnce();
		expect(peer.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason: RpcCloseReasonEnum.protocolFault,
			error: {
				code: RpcExceptionCodeEnum.protocol,
				cause: {
					message: "Protocol requested an invalid Session transition.",
				},
			},
		});
	});

	it.each(nonterminalProjectionCases)("$name with matching state and event", ({
		peerState,
		transition,
		expectedState,
		expectedEvent,
	}) => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => events.push(event));
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];
		if (peer === undefined) {
			throw new Error("Expected an admitted Peer.");
		}
		publishPeerState(harness.publisher, peer, peerState);

		host.transition(transition);

		expect(peer.state).toEqual(expectedState);
		expect(events.at(-1)).toMatchObject({ ...expectedEvent, peer });
	});

	it("ignores callbacks after the Owner is terminal", () => {
		for (const status of [
			RpcStateStatusEnum.closing,
			RpcStateStatusEnum.closed,
		] as const) {
			const harness = createAcceptorHarness();
			const forceClose = vi.fn();
			const host = admitAcceptor(harness, createSession(forceClose));
			if (status === RpcStateStatusEnum.closing) {
				publishAcceptorState(harness.publisher, { status });
			} else {
				harness.publisher.finish(
					{
						status,
						outcome: RpcCloseOutcomeEnum.normal,
						reason: RpcCloseReasonEnum.forcedClose,
					},
					() => {},
				);
			}

			host.transition({
				type: RpcProtocolSessionTransitionTypeEnum.closed,
				reason: RpcCloseReasonEnum.remoteTerminated,
			});

			expect(forceClose).not.toHaveBeenCalled();
		}
	});
});
