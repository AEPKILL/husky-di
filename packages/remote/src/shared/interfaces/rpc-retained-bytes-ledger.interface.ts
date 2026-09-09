/**
 * @overview Shared retained-byte reservation ledger contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

export interface IRpcRetainedBytesReservation {
	release(): void;
}

export interface IRpcRetainedBytesLedger {
	reserve(bytes: number): IRpcRetainedBytesReservation | undefined;
}
