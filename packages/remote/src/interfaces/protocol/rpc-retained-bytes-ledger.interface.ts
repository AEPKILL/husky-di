/**
 * @overview Private retained-byte reservation ledger contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcRetainedBytesReservation } from "@/interfaces/protocol/rpc-protocol.interface";

export interface IRpcRetainedBytesLedger {
	reserve(bytes: number): IRpcRetainedBytesReservation | undefined;
}
