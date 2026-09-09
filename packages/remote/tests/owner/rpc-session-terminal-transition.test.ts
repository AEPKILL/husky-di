/**
 * @overview Verifies rpc session terminal transition.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { describe, expect, it } from "vitest";
import type { RpcEvent } from "../../src/modules/owner";
import { RpcProtocolSessionTransitionTypeEnum } from "../../src/modules/protocol";
import { RpcCloseOutcomeEnum } from "../../src/shared/enums/rpc-close-outcome.enum";
import { RpcCloseReasonEnum } from "../../src/shared/enums/rpc-close-reason.enum";
import { RpcEventTypeEnum } from "../../src/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "../../src/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "../../src/shared/enums/rpc-state-status.enum";
import {
	admitAcceptor,
	createAcceptorHarness,
	createSession,
} from "./ownership/test.utils";
import { terminalTransitionCases } from "./ownership/transitions/test.utils";

describe("shared transition policy behind both role adapters", () => {
	it.each(terminalTransitionCases)("classifies $name", ({
		prelude,
		transition,
		outcome,
		code,
	}) => {
		const harness = createAcceptorHarness();
		const events: RpcEvent[] = [];
		harness.publisher.event$.subscribe((event) => events.push(event));
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];
		const cause = new Error("terminal cause");
		for (const prior of prelude) {
			host.transition(prior);
		}

		host.transition({ ...transition, cause });

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome,
			reason:
				transition.type === RpcProtocolSessionTransitionTypeEnum.closed
					? transition.reason
					: undefined,
		});
		if (
			code !== undefined &&
			peer?.state.status === RpcStateStatusEnum.closed
		) {
			expect("error" in peer.state ? peer.state.error.code : undefined).toBe(
				code,
			);
			expect("error" in peer.state ? peer.state.error.cause : undefined).toBe(
				cause,
			);
		}
		expect(events.at(-1)).toMatchObject({
			type: RpcEventTypeEnum.peerClosed,
			peer,
			outcome,
		});
	});

	it.each([
		RpcCloseReasonEnum.gracefulShutdown,
		RpcCloseReasonEnum.forcedClose,
		RpcCloseReasonEnum.shutdownDeadline,
	] as const)("classifies Owner %s closure as normal", (reason) => {
		const harness = createAcceptorHarness();
		admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];

		harness.ownership.beginClosing(
			reason,
			reason !== RpcCloseReasonEnum.gracefulShutdown,
		);

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.normal,
			reason,
		});
	});

	it.each([
		RpcCloseReasonEnum.protocolFault,
		RpcCloseReasonEnum.resourceFault,
	] as const)("classifies Session %s closure as Protocol failure", (reason) => {
		const harness = createAcceptorHarness();
		const cause = new Error("fault cause");
		const host = admitAcceptor(harness, createSession());
		const peer = harness.publisher.peers[0];

		host.fault(reason, cause);

		expect(peer?.state).toMatchObject({
			status: RpcStateStatusEnum.closed,
			outcome: RpcCloseOutcomeEnum.failed,
			reason,
			error: { code: RpcExceptionCodeEnum.protocol, cause },
		});
	});
});
