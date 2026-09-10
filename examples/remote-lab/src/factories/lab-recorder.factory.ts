/**
 * @overview Records example calls and full handshake frames separately from safe public RPC events.
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
	LabSideEnum,
	LabSourceEnum,
} from "@/enums/lab-recording.enum";
import type { ILabRecorder } from "@/interfaces/lab-recorder.interface";
import type {
	LabCallRecord,
	LabHandshakeFrame,
	LabHandshakeObservation,
	LabLogEntry,
} from "@/types/lab-recording.type";
import { formatLabValue } from "@/utils/format-lab-value.util";

export function createLabRecorder(side: LabSideEnum): ILabRecorder {
	const pending = new Map<string, LabCallRecord>();
	const completed: LabCallRecord[] = [];
	const entries: LabLogEntry[] = [];
	let ordinal = 0;
	let connectionOrdinal = 0;
	let sessionId: string | undefined;
	function log(
		source: LabSourceEnum,
		summary: string,
		handshake?: LabHandshakeObservation,
		handshakeFrame?: LabHandshakeFrame,
	): void {
		entries.unshift({
			id: `${side}-${++ordinal}`,
			at: Date.now(),
			source,
			summary,
			...(handshake ? { handshake } : {}),
			...(handshakeFrame ? { handshakeFrame: { ...handshakeFrame } } : {}),
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
			let handshake: LabHandshakeObservation | undefined;
			if (
				event.type === RpcEventTypeEnum.peerOpened ||
				event.type === RpcEventTypeEnum.peerRecovering ||
				event.type === RpcEventTypeEnum.peerRecovered ||
				event.type === RpcEventTypeEnum.peerClosed
			) {
				handshake = {
					type: event.type,
					peerId,
					outcome:
						event.type === RpcEventTypeEnum.peerClosed
							? event.outcome
							: event.type === RpcEventTypeEnum.peerRecovering
								? LabCallOutcomeEnum.pending
								: LabCallOutcomeEnum.fulfilled,
					...(event.type === RpcEventTypeEnum.peerClosed
						? { reason: event.reason }
						: {}),
				};
			}
			if (
				event.type === RpcEventTypeEnum.callStarted ||
				event.type === RpcEventTypeEnum.callFinished
			) {
				summary += ` · ${event.observationId} (local observation) · ${event.direction} · ${event.service ?? "unknown"}.${event.method ?? "unknown"}`;
				if (event.type === RpcEventTypeEnum.callFinished)
					summary += ` · ${"code" in event ? event.code : event.outcome} · ${event.durationMs} ms`;
			} else if ("reason" in event) summary += ` · ${event.reason}`;
			log(LabSourceEnum.rpc, summary, handshake);
		},
		allocateConnectionId() {
			return `${side}-connection-${++connectionOrdinal}`;
		},
		recordTransport(phase, bytes, handshakeFrame) {
			if (handshakeFrame?.sessionId !== undefined) {
				if (side === LabSideEnum.browser)
					sessionId ??= handshakeFrame.sessionId;
				for (const [index, entry] of entries.entries()) {
					if (
						entry.handshakeFrame?.connectionId ===
							handshakeFrame.connectionId &&
						entry.handshakeFrame.sessionId === undefined
					) {
						entries[index] = {
							...entry,
							handshakeFrame: {
								...entry.handshakeFrame,
								sessionId: handshakeFrame.sessionId,
							},
						};
					}
				}
			}
			log(
				LabSourceEnum.transport,
				`${side} · ${phase} · ${bytes} B · connection-level${handshakeFrame ? ` · ${handshakeFrame.connectionId} · ${handshakeFrame.type}` : ""}`,
				undefined,
				handshakeFrame,
			);
		},
		snapshot() {
			return {
				...(sessionId === undefined ? {} : { sessionId }),
				calls: [...pending.values(), ...completed]
					.sort((left, right) => right.startedAt - left.startedAt)
					.map((call) => ({
						...call,
						phases: call.phases.map((phase) => ({ ...phase })),
					})),
				entries: entries.map((entry) => ({
					...entry,
					...(entry.handshake ? { handshake: { ...entry.handshake } } : {}),
					...(entry.handshakeFrame
						? { handshakeFrame: { ...entry.handshakeFrame } }
						: {}),
				})),
			};
		},
		clear() {
			completed.length = 0;
			entries.length = 0;
		},
	};
}
