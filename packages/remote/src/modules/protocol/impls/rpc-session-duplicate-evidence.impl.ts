/**
 * @overview Retains and compacts charged stream semantic snapshots for duplicate validation.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import {
	RPC_ENTRY_OVERHEAD_BYTES,
	RPC_MAX_INGRESS_RECORDS,
} from "@/modules/protocol/constants/rpc-limits.const";
import type { IRpcRetainedBytesReservation } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcSessionDuplicateEvidence,
	RpcSessionDuplicateEvidenceFactory,
} from "@/modules/protocol/interfaces/rpc-session-duplicate-evidence.interface";
import type {
	RpcMessageEnvelope,
	RpcSemanticMessage,
} from "@/modules/protocol/types/rpc-wire-record.type";
import { getRpcStreamLane } from "@/modules/protocol/utils/rpc-stream-lane.util";

export type CreateRpcSessionDuplicateEvidenceOptions =
	Parameters<RpcSessionDuplicateEvidenceFactory>[0];

export class RpcSessionDuplicateEvidenceImpl
	implements IRpcSessionDuplicateEvidence
{
	readonly _entries = new Map<
		number,
		{ body: string; reservation: IRpcRetainedBytesReservation }
	>();
	readonly _reserve: CreateRpcSessionDuplicateEvidenceOptions["reserveRetainedBytes"];

	constructor(options: CreateRpcSessionDuplicateEvidenceOptions) {
		this._reserve = options.reserveRetainedBytes;
	}

	matches(envelope: RpcMessageEnvelope): boolean {
		const retained = this._entries.get(envelope.seq);
		return (
			retained === undefined ||
			retained.body === serializeSemanticMessage(envelope.message)
		);
	}

	retain(envelope: RpcMessageEnvelope): void {
		if (
			this._reserve === undefined ||
			getRpcStreamLane(envelope.message) === undefined
		)
			return;
		const body = serializeSemanticMessage(envelope.message);
		const charge =
			new TextEncoder().encode(body).byteLength + RPC_ENTRY_OVERHEAD_BYTES;
		if (this._entries.size >= RPC_MAX_INGRESS_RECORDS) this._evict();
		let reservation = this._reserve(charge);
		while (reservation === undefined && this._entries.size !== 0) {
			this._evict();
			reservation = this._reserve(charge);
		}
		// The delivery high-water mark survives compaction under ordinary byte pressure.
		if (reservation !== undefined)
			this._entries.set(envelope.seq, { body, reservation });
	}

	clear(): void {
		for (const entry of this._entries.values()) entry.reservation.release();
		this._entries.clear();
	}

	_evict(): void {
		const oldest = this._entries.entries().next().value;
		if (oldest === undefined) return;
		oldest[1].reservation.release();
		this._entries.delete(oldest[0]);
	}
}

function serializeSemanticMessage(message: RpcSemanticMessage): string {
	return JSON.stringify(message, (_key, value: unknown) => {
		if (typeof value !== "object" || value === null || Array.isArray(value))
			return value;
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.map((key) => [key, record[key]]),
		);
	});
}
