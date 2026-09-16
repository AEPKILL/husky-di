/**
 * @overview Records example calls and Transport messages separately from safe public RPC events.
 * @author AEPKILL
 * @created 2026-09-10 00:38:10
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
	LabConnectionObservation,
	LabHandshakeObservation,
	LabLogEntry,
	LabTransportMessage,
} from "@/types/lab-recording.type";
import { formatLabValue } from "@/utils/format-lab-value.util";
import { isLabHandshakeFrame } from "@/utils/parse-lab-transport-message.util";

export function createLabRecorder(side: LabSideEnum): ILabRecorder {
	const pending = new Map<string, LabCallRecord>();
	const completed: LabCallRecord[] = [];
	const entries: LabLogEntry[] = [];
	const connections = new Map<string, LabConnectionObservation>();
	const managedE2eSessions = new Set<string>();
	let ordinal = 0;
	let connectionOrdinal = 0;
	let sessionId: string | undefined;
	function log(
		source: LabSourceEnum,
		summary: string,
		handshake?: LabHandshakeObservation,
		transportMessage?: LabTransportMessage,
		managedE2e = false,
	): void {
		entries.unshift({
			id: `${side}-${++ordinal}`,
			at: Date.now(),
			source,
			summary,
			...(managedE2e ? { managedE2e: true } : {}),
			...(handshake ? { handshake } : {}),
			...(transportMessage
				? {
						transportMessage: { ...transportMessage },
						...(isLabHandshakeFrame(transportMessage)
							? { handshakeFrame: { ...transportMessage } }
							: {}),
					}
				: {}),
		});
		entries.length = Math.min(entries.length, 200);
	}
	return {
		async run(context, args, operation) {
			if (context.traceId.startsWith("e2e:")) {
				const session = entries.find(
					(entry) => entry.transportMessage?.sessionId !== undefined,
				)?.transportMessage?.sessionId;
				if (session !== undefined) managedE2eSessions.add(session);
				for (const [index, entry] of entries.entries()) {
					if (
						entry.transportMessage?.sessionId !== undefined &&
						managedE2eSessions.has(entry.transportMessage.sessionId)
					)
						entries[index] = { ...entry, managedE2e: true };
				}
			}
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
			const connectionId = `${side}-connection-${++connectionOrdinal}`;
			connections.set(connectionId, { connectionId, observedAt: Date.now() });
			return connectionId;
		},
		closeConnection(connectionId) {
			connections.delete(connectionId);
		},
		recordTransport(phase, bytes, message) {
			if (message?.sessionId !== undefined) {
				if (connections.has(message.connectionId))
					connections.set(message.connectionId, {
						connectionId: message.connectionId,
						sessionId: message.sessionId,
						observedAt: Date.now(),
					});
				if (side === LabSideEnum.browser) sessionId ??= message.sessionId;
				for (const [index, entry] of entries.entries()) {
					if (
						entry.transportMessage?.connectionId === message.connectionId &&
						entry.transportMessage.sessionId === undefined
					) {
						entries[index] = {
							...entry,
							transportMessage: {
								...entry.transportMessage,
								sessionId: message.sessionId,
							},
							...(entry.handshakeFrame
								? {
										handshakeFrame: {
											...entry.handshakeFrame,
											sessionId: message.sessionId,
										},
									}
								: {}),
						};
					}
				}
			}
			log(
				LabSourceEnum.transport,
				`${side} · ${phase} · ${bytes} B · connection-level${message ? ` · ${message.connectionId} · ${message.type}` : ""}`,
				undefined,
				message,
				message?.sessionId !== undefined &&
					managedE2eSessions.has(message.sessionId),
			);
		},
		snapshot() {
			return {
				connections: [...connections.values()].map((connection) => ({
					...connection,
				})),
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
					...(entry.transportMessage
						? { transportMessage: { ...entry.transportMessage } }
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
