/**
 * @overview Records real example calls separately from safe RPC events and connection-level byte observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	RpcCallDirectionEnum,
	RpcEventTypeEnum,
	RpcException,
} from "@husky-di/remote";
import {
	LabCallOutcomeEnum,
	type LabSideEnum,
	LabSourceEnum,
} from "@/enums/lab-recording.enum";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type { LabCallRecord, LabLogEntry } from "@/types/lab-recording.type";
import { formatLabValue } from "@/utils/format-lab-value.util";

export function createLabRecorder(side: LabSideEnum): ILabRecorder {
	const pending = new Map<string, LabCallRecord>();
	const completed: LabCallRecord[] = [];
	const entries: LabLogEntry[] = [];
	let ordinal = 0;
	function log(source: LabSourceEnum, summary: string): void {
		entries.unshift({
			id: `${side}-${++ordinal}`,
			at: Date.now(),
			source,
			summary,
		});
		entries.length = Math.min(entries.length, 200);
	}
	return {
		async run(context, args, operation) {
			const startedAt = Date.now();
			const entryPhase =
				context.direction === RpcCallDirectionEnum.incoming
					? "Handler entered"
					: "Facade invoked";
			const record: LabCallRecord = {
				...context,
				id: `${side}-call-${++ordinal}`,
				startedAt,
				outcome: LabCallOutcomeEnum.pending,
				arguments: formatLabValue(args),
				phases: [{ phase: entryPhase, at: startedAt }],
			};
			pending.set(record.id, record);
			log(
				LabSourceEnum.application,
				`${context.peerId} · ${context.traceId} · ${context.service}.${context.method} · ${entryPhase}`,
			);
			let outcome: string = LabCallOutcomeEnum.fulfilled;
			let result: string | undefined;
			try {
				const value = await operation();
				result = formatLabValue(value);
				return value;
			} catch (error) {
				outcome =
					error instanceof RpcException
						? error.code
						: error instanceof TypeError
							? LabCallOutcomeEnum.typeError
							: LabCallOutcomeEnum.handlerFailed;
				throw error;
			} finally {
				const latest = pending.get(record.id) ?? record;
				const finishedAt = Date.now();
				pending.delete(record.id);
				completed.unshift({
					...latest,
					outcome,
					result,
					finishedAt,
					phases: [
						...latest.phases.slice(0, 23),
						{
							phase:
								context.direction === RpcCallDirectionEnum.incoming
									? "Handler settled"
									: "Caller settled",
							at: finishedAt,
							detail: outcome,
						},
					],
				});
				completed.length = Math.min(completed.length, 100);
				log(
					LabSourceEnum.application,
					`${context.peerId} · ${context.traceId} · ${context.service}.${context.method} · ${outcome}`,
				);
			}
		},
		mark(traceId, phase, detail) {
			for (const [id, call] of pending) {
				if (call.traceId !== traceId || call.phases.length >= 23) continue;
				pending.set(id, {
					...call,
					phases: [
						...call.phases,
						{
							phase,
							at: Date.now(),
							...(detail === undefined
								? {}
								: { detail: formatLabValue(detail) }),
						},
					],
				});
			}
			log(LabSourceEnum.application, `${traceId} · ${phase}`);
		},
		recordEvent(event, peerId = side) {
			let summary = `${peerId} · ${event.type}`;
			if (
				event.type === RpcEventTypeEnum.callStarted ||
				event.type === RpcEventTypeEnum.callFinished
			) {
				summary += ` · ${event.observationId} (local observation) · ${event.direction} · ${event.service ?? "unknown"}.${event.method ?? "unknown"}`;
				if (event.type === RpcEventTypeEnum.callFinished)
					summary += ` · ${"code" in event ? event.code : event.outcome} · ${event.durationMs} ms`;
			} else if ("reason" in event) summary += ` · ${event.reason}`;
			log(LabSourceEnum.rpc, summary);
		},
		recordTransport(phase, bytes) {
			log(
				LabSourceEnum.transport,
				`${side} · ${phase} · ${bytes} B · connection-level`,
			);
		},
		snapshot() {
			return {
				calls: [...pending.values(), ...completed]
					.sort((left, right) => right.startedAt - left.startedAt)
					.map((call) => ({
						...call,
						phases: call.phases.map((phase) => ({ ...phase })),
					})),
				entries: entries.map((entry) => ({ ...entry })),
			};
		},
		clear() {
			completed.length = 0;
			entries.length = 0;
		},
	};
}
