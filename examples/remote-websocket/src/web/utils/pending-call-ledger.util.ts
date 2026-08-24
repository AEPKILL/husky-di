/**
 * @overview Projects call lifecycle events into the Web pending-call ledger.
 * @author AEPKILL
 * @created 2026-08-20 23:34:16
 */

import { type RpcEvent, RpcEventTypeEnum } from "@husky-di/remote";

import type { PendingCallDiagnostic } from "@/types/rpc-diagnostics.type";

export function updatePendingCallDiagnostics(
	current: readonly PendingCallDiagnostic[],
	event: RpcEvent,
	timestamp: number,
): readonly PendingCallDiagnostic[] {
	if (event.type === RpcEventTypeEnum.callStarted) {
		return [
			{
				observationId: event.observationId,
				direction: event.direction,
				service: event.service ?? "unknown-service",
				member: event.member ?? "unknown-member",
				startedAt: timestamp,
			},
			...current,
		];
	}
	if (event.type === RpcEventTypeEnum.callFinished) {
		return current.filter((call) => call.observationId !== event.observationId);
	}
	return current;
}
