/**
 * @overview Pending-call observatory ledger behavior tests.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	type RpcEvent,
	RpcEventTypeEnum,
} from "@husky-di/remote";

import { updatePendingCallDiagnostics } from "@/web/utils/pending-call-ledger.util";

describe("pending-call observatory ledger", () => {
	it("keeps a call pending until its matching terminal observation", () => {
		const started = {
			type: RpcEventTypeEnum.callStarted,
			observationId: "call-1",
			direction: RpcCallDirectionEnum.outgoing,
			service: "example.greeting.v1",
			method: "greet",
		} as unknown as RpcEvent;
		const finished = {
			type: RpcEventTypeEnum.callFinished,
			observationId: "call-1",
			direction: RpcCallDirectionEnum.outgoing,
			service: "example.greeting.v1",
			method: "greet",
			outcome: RpcCallStatusEnum.fulfilled,
			durationMs: 2_000,
		} as unknown as RpcEvent;

		const pending = updatePendingCallDiagnostics([], started, 100);
		assert.deepEqual(pending, [
			{
				observationId: "call-1",
				direction: "outgoing",
				service: "example.greeting.v1",
				method: "greet",
				startedAt: 100,
			},
		]);
		assert.deepEqual(
			updatePendingCallDiagnostics(pending, finished, 2_100),
			[],
		);
	});
});
