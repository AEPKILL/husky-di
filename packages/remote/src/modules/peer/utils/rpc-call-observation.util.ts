/**
 * @overview Creates shared call correlation identifiers and bounded observation durations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

export function createObservationId(): string {
	nextObservationOrdinal += 1;
	return `rpc-observation-${nextObservationOrdinal}`;
}

export function observationDuration(startedAt: number): number {
	return Math.min(
		Number.MAX_SAFE_INTEGER,
		Math.max(0, Math.floor(Date.now() - startedAt)),
	);
}

let nextObservationOrdinal = 0;
