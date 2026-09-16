/**
 * @overview Runs an explicit, bounded RxJS Observable stream lifecycle experiment.
 * @author AEPKILL
 * @created 2026-09-13 23:08:57
 */

import { RpcWireRecordKindEnum } from "@husky-di/remote/protocol";
import { Subject, type Subscription } from "rxjs";
import {
	LabSourceEnum,
	LabTransportDirectionEnum,
} from "@/enums/lab-recording.enum";
import {
	LabStreamKindEnum,
	LabStreamNetworkKindEnum,
	LabStreamSourceStatusEnum,
	LabStreamStatusEnum,
} from "@/enums/lab-stream.enum";
import type { LabLogEntry } from "@/types/lab-recording.type";
import type {
	LabStreamExperimentSnapshot,
	LabStreamRecord,
} from "@/types/lab-stream.type";

const MAX_RETAINED = 4;

export interface ILabStreamExperiment {
	snapshot(): LabStreamExperimentSnapshot;
	open(kind: LabStreamKindEnum): void;
	next(value: string): void;
	complete(): void;
	error(): void;
	unsubscribeLatest(): void;
	disconnect(): void;
	recover(): void;
	overflow(): void;
	reset(): void;
	clearNetwork(): void;
}

export function createLabStreamExperiment(): ILabStreamExperiment {
	let connected = true;
	let nextStreamId = 1;
	let retained = 0;
	let staticSubscribers = 0;
	let staticSource = new Subject<string>();
	const streams = new Map<number, StreamEntry>();
	const logs: string[] = ["ready · no remote subscriptions"];
	const networkEntries: LabLogEntry[] = [];
	let networkOrdinal = 0;
	const encoder = new TextEncoder();

	function log(message: string): void {
		logs.unshift(message);
		logs.length = Math.min(logs.length, 80);
	}

	function recordNetwork(
		kind: string,
		message: Record<string, unknown>,
		direction: LabTransportDirectionEnum,
		outcome = "fulfilled",
	): void {
		const payload = JSON.stringify({
			kind: RpcWireRecordKindEnum.message,
			seq: ++networkOrdinal,
			message,
		});
		networkEntries.unshift({
			id: `Browser-stream-${networkOrdinal}`,
			at: Date.now(),
			source: LabSourceEnum.stream,
			summary: `Stream instrumentation · ${kind}`,
			transportMessage: {
				type: RpcWireRecordKindEnum.message,
				connectionId: "Browser-stream-experiment",
				sessionId: "stream-experiment",
				direction,
				bytes: encoder.encode(payload).byteLength,
				outcome,
				payload,
			},
		});
		networkEntries.length = Math.min(networkEntries.length, 200);
	}

	function open(kind: LabStreamKindEnum): void {
		if (
			kind === LabStreamKindEnum.static &&
			(staticSource.closed || staticSource.isStopped)
		)
			staticSource = new Subject<string>();
		const id = nextStreamId++;
		const source =
			kind === LabStreamKindEnum.static ? staticSource : new Subject<string>();
		const entry: StreamEntry = {
			id,
			kind,
			status: LabStreamStatusEnum.open,
			values: [],
			retainedValues: [],
			terminal: "—",
			source,
			subscription: undefined,
		};
		entry.subscription = source.subscribe({
			next(value) {
				entry.values.push(value);
			},
			complete() {
				finish(entry, LabStreamStatusEnum.complete, "complete");
			},
			error() {
				finish(entry, LabStreamStatusEnum.error, "error(handler-failed)");
			},
		});
		streams.set(id, entry);
		recordNetwork(
			RpcWireRecordKindEnum.streamOpen,
			{
				kind: RpcWireRecordKindEnum.streamOpen,
				streamId: String(id),
				service: "example.stream.v1",
				member: kind === LabStreamKindEnum.static ? "static" : "observe",
				streamKind: kind,
				args: [],
			},
			LabTransportDirectionEnum.sent,
		);
		if (kind === LabStreamKindEnum.static) {
			staticSubscribers += 1;
			if (staticSubscribers === 1) {
				recordNetwork(
					LabStreamNetworkKindEnum.sourceConnect,
					{
						kind: LabStreamNetworkKindEnum.sourceConnect,
						source: "static",
						subscribers: staticSubscribers,
					},
					LabTransportDirectionEnum.sent,
				);
				log(`stream-${id} open · Static Source first subscribe()`);
			} else {
				recordNetwork(
					LabStreamNetworkKindEnum.sourceShare,
					{
						kind: LabStreamNetworkKindEnum.sourceShare,
						source: "static",
						subscribers: staticSubscribers,
					},
					LabTransportDirectionEnum.sent,
				);
				log(
					`stream-${id} open · Static Source already connected, no duplicate subscription`,
				);
			}
		} else log(`stream-${id} open · Method handler independent execution`);
	}

	function finish(
		entry: StreamEntry,
		status: LabStreamStatusEnum,
		terminal: string,
	): void {
		if (entry.status !== LabStreamStatusEnum.open) return;
		entry.status = status;
		entry.terminal = terminal;
		if (status === LabStreamStatusEnum.complete) {
			recordNetwork(
				RpcWireRecordKindEnum.streamComplete,
				{
					kind: RpcWireRecordKindEnum.streamComplete,
					streamId: String(entry.id),
				},
				LabTransportDirectionEnum.received,
			);
		} else if (status === LabStreamStatusEnum.error) {
			recordNetwork(
				RpcWireRecordKindEnum.streamError,
				{
					kind: RpcWireRecordKindEnum.streamError,
					streamId: String(entry.id),
					error: {
						code: terminal.includes("unavailable")
							? "unavailable"
							: "handler-failed",
					},
				},
				LabTransportDirectionEnum.received,
				"failed",
			);
		} else if (status === LabStreamStatusEnum.canceled) {
			recordNetwork(
				RpcWireRecordKindEnum.streamCancel,
				{
					kind: RpcWireRecordKindEnum.streamCancel,
					streamId: String(entry.id),
					silent: true,
				},
				LabTransportDirectionEnum.sent,
			);
		}
		retained = Math.max(0, retained - entry.retainedValues.length);
		entry.retainedValues.length = 0;
		entry.subscription?.unsubscribe();
		entry.subscription = undefined;
		if (entry.kind === LabStreamKindEnum.static) {
			staticSubscribers = Math.max(0, staticSubscribers - 1);
			if (staticSubscribers === 0) {
				recordNetwork(
					LabStreamNetworkKindEnum.sourceTeardown,
					{
						kind: LabStreamNetworkKindEnum.sourceTeardown,
						source: "static",
						subscribers: 0,
					},
					LabTransportDirectionEnum.received,
				);
				log("Static Source teardown after last subscription ends");
			}
		}
		log(`stream-${entry.id} ${terminal}`);
	}

	function next(value: string): void {
		const live = [...streams.values()].filter(
			(entry) => entry.status === LabStreamStatusEnum.open,
		);
		if (live.length === 0) {
			log("No open stream can receive next");
			return;
		}
		const staticLive = live.filter(
			(entry) => entry.kind === LabStreamKindEnum.static,
		);
		if (!connected) {
			for (const entry of live) {
				if (retained >= MAX_RETAINED) {
					finish(entry, LabStreamStatusEnum.error, "error(unavailable)");
					continue;
				}
				entry.retainedValues.push(value);
				retained += 1;
				recordNetwork(
					RpcWireRecordKindEnum.streamNext,
					{
						kind: RpcWireRecordKindEnum.streamNext,
						streamId: String(entry.id),
						value,
						retained: true,
					},
					LabTransportDirectionEnum.received,
				);
				log(
					`stream-${entry.id} next cached (retained ${retained}/${MAX_RETAINED})`,
				);
			}
			return;
		}
		if (staticLive.length > 0) {
			staticSource.next(value);
			for (const entry of staticLive) {
				recordNetwork(
					RpcWireRecordKindEnum.streamNext,
					{
						kind: RpcWireRecordKindEnum.streamNext,
						streamId: String(entry.id),
						value,
					},
					LabTransportDirectionEnum.received,
				);
				log(`stream-${entry.id} next → observer.next`);
			}
		}
		for (const entry of live.filter(
			(candidate) => candidate.kind === LabStreamKindEnum.method,
		)) {
			entry.source.next(value);
			recordNetwork(
				RpcWireRecordKindEnum.streamNext,
				{
					kind: RpcWireRecordKindEnum.streamNext,
					streamId: String(entry.id),
					value,
				},
				LabTransportDirectionEnum.received,
			);
			log(`stream-${entry.id} next → observer.next`);
		}
	}

	function complete(): void {
		for (const entry of [...streams.values()]) {
			if (entry.status !== LabStreamStatusEnum.open) continue;
			if (entry.kind === LabStreamKindEnum.static) staticSource.complete();
			else entry.source.complete();
		}
	}

	function error(): void {
		for (const entry of [...streams.values()]) {
			if (entry.status !== LabStreamStatusEnum.open) continue;
			if (entry.kind === LabStreamKindEnum.static)
				staticSource.error(new Error("source"));
			else entry.source.error(new Error("source"));
		}
	}

	function unsubscribeLatest(): void {
		const entry = [...streams.values()]
			.reverse()
			.find((candidate) => candidate.status === LabStreamStatusEnum.open);
		if (!entry) {
			log("No open stream to unsubscribe");
			return;
		}
		finish(
			entry,
			LabStreamStatusEnum.canceled,
			"unsubscribe -> stream-cancel (silent end)",
		);
	}

	function disconnect(): void {
		if (!connected) return;
		connected = false;
		recordNetwork(
			LabStreamNetworkKindEnum.disconnect,
			{ kind: LabStreamNetworkKindEnum.disconnect, retained: true },
			LabTransportDirectionEnum.sent,
		);
		log(
			"Physical Connection disconnected; open streams retain execution state",
		);
	}

	function recover(): void {
		connected = true;
		const replayed = retained;
		recordNetwork(
			LabStreamNetworkKindEnum.recover,
			{ kind: LabStreamNetworkKindEnum.recover, replayed },
			LabTransportDirectionEnum.received,
		);
		log(`Recovery succeeded; replayed ${replayed} cached events in order`);
		const staticLive = [...streams.values()].filter(
			(entry) =>
				entry.status === LabStreamStatusEnum.open &&
				entry.kind === LabStreamKindEnum.static,
		);
		const staticValues = staticLive[0]?.retainedValues ?? [];
		for (const value of staticValues) {
			staticSource.next(value);
			for (const entry of staticLive) {
				recordNetwork(
					RpcWireRecordKindEnum.streamNext,
					{
						kind: RpcWireRecordKindEnum.streamNext,
						streamId: String(entry.id),
						value,
						replay: true,
					},
					LabTransportDirectionEnum.received,
				);
			}
		}
		for (const entry of streams.values()) {
			if (entry.status !== LabStreamStatusEnum.open) continue;
			if (entry.kind === LabStreamKindEnum.method) {
				for (const value of entry.retainedValues) {
					entry.source.next(value);
					recordNetwork(
						RpcWireRecordKindEnum.streamNext,
						{
							kind: RpcWireRecordKindEnum.streamNext,
							streamId: String(entry.id),
							value,
							replay: true,
						},
						LabTransportDirectionEnum.received,
					);
				}
			}
			entry.retainedValues.length = 0;
		}
		retained = 0;
	}

	function overflow(): void {
		disconnect();
		recordNetwork(
			LabStreamNetworkKindEnum.overflow,
			{ kind: LabStreamNetworkKindEnum.overflow, maxRetained: MAX_RETAINED },
			LabTransportDirectionEnum.sent,
		);
		let count = 0;
		while (
			[...streams.values()].some(
				(entry) => entry.status === LabStreamStatusEnum.open,
			) &&
			count < MAX_RETAINED + 2
		) {
			next(`v${count + 1}`);
			count += 1;
		}
	}

	function reset(): void {
		for (const entry of streams.values()) entry.subscription?.unsubscribe();
		streams.clear();
		staticSource = new Subject<string>();
		connected = true;
		nextStreamId = 1;
		retained = 0;
		staticSubscribers = 0;
		networkEntries.length = 0;
		networkOrdinal = 0;
		logs.length = 0;
		log("ready · no remote subscriptions");
	}

	function clearNetwork(): void {
		networkEntries.length = 0;
		networkOrdinal = 0;
	}

	return {
		snapshot() {
			return {
				connected,
				retained,
				maxRetained: MAX_RETAINED,
				staticSource:
					staticSubscribers > 0
						? LabStreamSourceStatusEnum.connected
						: LabStreamSourceStatusEnum.idle,
				staticSubscribers,
				nextStreamId,
				streams: [...streams.values()].map(toSnapshot),
				logs: [...logs],
				networkEntries: networkEntries.map((entry) => ({
					...entry,
					...(entry.transportMessage
						? { transportMessage: { ...entry.transportMessage } }
						: {}),
				})),
			};
		},
		open,
		next,
		complete,
		error,
		unsubscribeLatest,
		disconnect,
		recover,
		overflow,
		reset,
		clearNetwork,
	};
}

function toSnapshot(entry: StreamEntry): LabStreamRecord {
	return {
		id: entry.id,
		kind: entry.kind,
		status: entry.status,
		values: [...entry.values],
		terminal: entry.terminal,
		retained: entry.retainedValues.length,
	};
}

type StreamEntry = {
	readonly id: number;
	readonly kind: LabStreamKindEnum;
	status: LabStreamStatusEnum;
	readonly values: string[];
	readonly retainedValues: string[];
	terminal: string;
	readonly source: Subject<string>;
	subscription: Subscription | undefined;
};
