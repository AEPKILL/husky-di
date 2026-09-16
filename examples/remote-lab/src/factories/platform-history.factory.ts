/**
 * @overview Atomically persists bounded project history with a lightweight list index and honest interruption recovery after restart.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import { randomUUID } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { IPlatformHistory } from "@/interfaces/platform-project.interface";
import type {
	PlatformHistoryRecord,
	PlatformHistorySummary,
} from "@/types/platform-project.type";

export type CreatePlatformHistoryOptions = {
	path: string;
	maxCount: number;
	maxBytes: number;
};

export async function createPlatformHistory(
	options: CreatePlatformHistoryOptions,
): Promise<IPlatformHistory> {
	const { path, maxCount, maxBytes } = options;
	await mkdir(path, { recursive: true });
	const index = new Map<string, PlatformHistorySummary>();
	let queue: Promise<unknown> = Promise.resolve();
	let lastSavedAt = Date.now();
	const recordPath = (id: string) => {
		if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id))
			throw new Error("Invalid history record ID");
		return join(path, `${id}.json`);
	};
	const readHistory = async (id: string): Promise<PlatformHistoryRecord> =>
		JSON.parse(await readFile(recordPath(id), "utf8"));
	const summary = (
		record: PlatformHistoryRecord,
		bytes: number,
	): PlatformHistorySummary => ({
		id: record.id,
		data: structuredClone(
			Object.fromEntries(
				Object.entries(record.data).filter(
					([key]) => key !== "events" && key !== "snapshot",
				),
			),
		),
		entry: record.snapshot.entry,
		createdAt: record.snapshot.createdAt,
		savedAt: record.savedAt ?? record.snapshot.createdAt,
		active: record.active,
		interrupted: record.interrupted ?? false,
		recordingTruncated: record.recordingTruncated ?? false,
		bytes,
	});
	const records = () =>
		[...index.values()].sort((left, right) => right.savedAt - left.savedAt);
	const persist = async (record: PlatformHistoryRecord) => {
		const destination = recordPath(record.id);
		const temporary = join(path, `.${randomUUID()}.tmp`);
		const content = JSON.stringify(record);
		try {
			await writeFile(temporary, content, { flag: "wx", flush: true });
			await rename(temporary, destination);
			index.set(record.id, summary(record, Buffer.byteLength(content)));
		} finally {
			await rm(temporary, { force: true });
		}
	};
	const prune = async () => {
		let bytes = 0;
		let count = 0;
		const retained = records().sort(
			(left, right) => Number(right.active) - Number(left.active),
		);
		for (const item of retained) {
			if (count < maxCount && bytes + item.bytes <= maxBytes) {
				bytes += item.bytes;
				count += 1;
			} else {
				await rm(recordPath(item.id), { force: true });
				index.delete(item.id);
			}
		}
	};
	const serial = <T>(operation: () => Promise<T>) => {
		const next = queue.then(operation);
		queue = next.catch(() => undefined);
		return next;
	};
	for (const file of await readdir(path)) {
		if (/^\.[a-f0-9-]+\.tmp$/.test(file)) {
			await rm(join(path, file), { force: true });
			continue;
		}
		if (!file.endsWith(".json")) continue;
		const content = await readFile(join(path, file), "utf8");
		// Atomic writes leave either complete JSON or an ignored temporary file. Damaged external files fail honestly on open.
		const record = JSON.parse(content) as PlatformHistoryRecord;
		lastSavedAt = Math.max(lastSavedAt, record.savedAt ?? 0);
		if (record.active)
			await persist({
				...record,
				active: false,
				interrupted: true,
				recordingNotice:
					"The project service restarted before execution and cleanup were confirmed. Stored evidence does not establish a completed run.",
			});
		else index.set(record.id, summary(record, Buffer.byteLength(content)));
	}
	await prune();
	return {
		readHistory: (id) => serial(() => readHistory(id)),
		deleteHistory: (id) =>
			serial(async () => {
				if (index.get(id)?.active)
					throw new Error("Stop the active run before deleting its history");
				await rm(recordPath(id));
				index.delete(id);
			}),
		listHistory: () => serial(async () => structuredClone(records())),
		saveHistory: (input) =>
			serial(async () => {
				lastSavedAt = Math.max(Date.now(), lastSavedAt + 1);
				const record: PlatformHistoryRecord = {
					...structuredClone(input),
					savedAt: lastSavedAt,
				};
				const events = Array.isArray(record.data.events)
					? (record.data.events as { type?: string }[])
					: [];
				while (Buffer.byteLength(JSON.stringify(record)) > maxBytes) {
					const eventIndex = events.findIndex(
						(event) => event.type === "record",
					);
					if (eventIndex === -1)
						throw new Error(
							"History capacity is too small to preserve this run's source, assertions and result; increase the history byte limit",
						);
					events.splice(eventIndex, 1);
					record.recordingTruncated = true;
					record.recordingNotice =
						"Oldest observation records were omitted to honor the history byte limit. Source, assertions and result are preserved.";
				}
				await persist(record);
				await prune();
				return record;
			}),
	};
}
