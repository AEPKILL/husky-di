/**
 * @overview Bounded stream duplicate-body evidence and retained-byte ownership.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 00:10:00
 */

import type { IRpcRetainedBytesReservation } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type { RpcMessageEnvelope } from "@/modules/protocol/types/rpc-wire-record.type";

export interface IRpcSessionDuplicateEvidence {
	matches(envelope: RpcMessageEnvelope): boolean;
	retain(envelope: RpcMessageEnvelope): void;
	clear(): void;
}

export type RpcSessionDuplicateEvidenceFactory = (options: {
	readonly reserveRetainedBytes?: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
}) => IRpcSessionDuplicateEvidence;
