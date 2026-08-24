/**
 * @overview Direction-local Topology Owner Application Work and Active Stream accounting.
 * @author AEPKILL
 * @created 2026-08-24 23:48:00
 */

import type {
	IRpcApplicationWorkLedger,
	IRpcApplicationWorkReservation,
} from "@/interfaces/rpc-application-work-ledger.interface";

interface RpcApplicationWorkCounts {
	activeStreams: number;
	work: number;
}

/** Atomically reserves one Owner Application Work slot and optional stream-subset slot. */
export class RpcApplicationWorkLedgerImpl implements IRpcApplicationWorkLedger {
	readonly #maximumActiveStreams: number;
	readonly #maximumWork: number;
	readonly #local: RpcApplicationWorkCounts = { activeStreams: 0, work: 0 };
	readonly #remote: RpcApplicationWorkCounts = { activeStreams: 0, work: 0 };
	readonly #idleWaiters = new Set<() => void>();

	constructor(maximumWork: number, maximumActiveStreams: number) {
		this.#maximumWork = maximumWork;
		this.#maximumActiveStreams = maximumActiveStreams;
	}

	reserveLocal(stream: boolean): IRpcApplicationWorkReservation | undefined {
		return this.#reserve(this.#local, stream);
	}

	reserveRemote(stream: boolean): IRpcApplicationWorkReservation | undefined {
		return this.#reserve(this.#remote, stream);
	}

	waitForIdle(): Promise<void> {
		if (this.#local.work === 0 && this.#remote.work === 0) {
			return Promise.resolve();
		}
		return new Promise((resolve) => this.#idleWaiters.add(resolve));
	}

	#reserve(
		counts: RpcApplicationWorkCounts,
		stream: boolean,
	): IRpcApplicationWorkReservation | undefined {
		// Work and its stream subset must be acquired as one Owner reservation.
		const ownerCapacityUnavailable =
			counts.work >= this.#maximumWork ||
			(stream && counts.activeStreams >= this.#maximumActiveStreams);
		if (ownerCapacityUnavailable) {
			return undefined;
		}
		counts.work += 1;
		if (stream) {
			counts.activeStreams += 1;
		}
		let released = false;
		return Object.freeze({
			release: () => {
				if (released) {
					return;
				}
				released = true;
				counts.work -= 1;
				if (stream) {
					counts.activeStreams -= 1;
				}
				if (this.#local.work === 0 && this.#remote.work === 0) {
					for (const resolve of this.#idleWaiters) {
						resolve();
					}
					this.#idleWaiters.clear();
				}
			},
		});
	}
}
