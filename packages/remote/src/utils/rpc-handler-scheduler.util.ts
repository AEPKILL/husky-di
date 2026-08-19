/**
 * @overview Fair owner-wide scheduler for captured incoming RPC handlers.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

export type RpcHandlerJob = (releasePermit: () => void) => boolean;

interface RpcHandlerSessionQueue {
	readonly jobs: RpcHandlerJob[];
	running: number;
	ready: boolean;
}

/** Acquires one owner permit and one per-Session permit before handler start. */
export class RpcHandlerScheduler {
	readonly #maximumOwnerHandlers: number;
	readonly #maximumSessionHandlers: number;
	readonly #sessions = new Map<object, RpcHandlerSessionQueue>();
	readonly #readySessions: object[] = [];
	#running = 0;
	#drainScheduled = false;

	constructor(maximumOwnerHandlers: number, maximumSessionHandlers: number) {
		this.#maximumOwnerHandlers = maximumOwnerHandlers;
		this.#maximumSessionHandlers = maximumSessionHandlers;
	}

	enqueue(session: object, job: RpcHandlerJob): void {
		let queue = this.#sessions.get(session);
		if (queue === undefined) {
			queue = { jobs: [], running: 0, ready: false };
			this.#sessions.set(session, queue);
		}
		queue.jobs.push(job);
		this.#markReady(session, queue);
		this.#scheduleDrain();
	}

	#markReady(session: object, queue: RpcHandlerSessionQueue): void {
		if (
			queue.ready ||
			queue.jobs.length === 0 ||
			queue.running >= this.#maximumSessionHandlers
		) {
			return;
		}
		queue.ready = true;
		this.#readySessions.push(session);
	}

	#scheduleDrain(): void {
		if (this.#drainScheduled) {
			return;
		}
		this.#drainScheduled = true;
		queueMicrotask(() => this.#drain());
	}

	#drain(): void {
		this.#drainScheduled = false;
		while (
			this.#running < this.#maximumOwnerHandlers &&
			this.#readySessions.length > 0
		) {
			const session = this.#readySessions.shift() as object;
			const queue = this.#sessions.get(session);
			if (queue === undefined) {
				continue;
			}
			queue.ready = false;
			const job = queue.jobs.shift();
			if (job === undefined || queue.running >= this.#maximumSessionHandlers) {
				this.#removeIdleSession(session, queue);
				continue;
			}

			queue.running += 1;
			this.#running += 1;
			let released = false;
			const release = (): void => {
				if (released) {
					return;
				}
				released = true;
				queue.running -= 1;
				this.#running -= 1;
				this.#markReady(session, queue);
				this.#removeIdleSession(session, queue);
				this.#scheduleDrain();
			};

			let started = false;
			try {
				started = job(release);
			} catch {
				// The job owns normalization of handler failure; release its permits here.
			}
			if (!started) {
				release();
			}
			this.#markReady(session, queue);
		}
	}

	#removeIdleSession(session: object, queue: RpcHandlerSessionQueue): void {
		if (queue.jobs.length === 0 && queue.running === 0 && !queue.ready) {
			this.#sessions.delete(session);
		}
	}
}
