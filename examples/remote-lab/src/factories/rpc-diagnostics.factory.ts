/**
 * @overview Collects bounded recent observations independently of live pending calls.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { RpcEventTypeEnum } from "@husky-di/remote";
import type { IRpcDiagnostics } from "@/interfaces/rpc-diagnostics.interface";
import type { PendingCall } from "@/types/rpc-diagnostics.type";

export function createRpcDiagnostics(): IRpcDiagnostics {
	const pending = new Map<string, PendingCall>();
	const recent: string[] = [];
	let totalEvents = 0;
	return {
		record(event) {
			totalEvents += 1;
			let summary: string = event.type;
			if (event.type === RpcEventTypeEnum.callStarted) {
				const call = {
					observationId: event.observationId,
					direction: event.direction,
					service: event.service,
					method: event.method,
				};
				pending.set(event.observationId, call);
				summary += ` · ${event.direction} · ${event.service ?? "unknown"}.${event.method ?? "unknown"}`;
			} else if (event.type === RpcEventTypeEnum.callFinished) {
				pending.delete(event.observationId);
				summary += ` · ${event.direction} · ${event.service ?? "unknown"}.${event.method ?? "unknown"} · ${event.outcome} · ${Math.round(event.durationMs)} ms`;
				if ("code" in event) summary += ` · ${event.code}`;
			}
			recent.unshift(summary);
			recent.length = Math.min(recent.length, 24);
		},
		snapshot() {
			return {
				totalEvents,
				pendingCalls: Array.from(pending.values(), (call) => ({ ...call })),
				recentEvents: [...recent],
			};
		},
		clear() {
			totalEvents = 0;
			recent.length = 0;
		},
	};
}
