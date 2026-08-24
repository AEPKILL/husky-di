/**
 * @overview Serialized generation-authoritative RPC event publication.
 * @author AEPKILL
 * @created 2026-08-24 23:20:00
 */

import { Observable, type Subscriber } from "rxjs";

import type { RpcEvent } from "@/interfaces/rpc-caller.interface";
import type { IRpcEventPublisher } from "@/interfaces/rpc-event-publisher.interface";

type RpcEventPublication = Readonly<{
	readonly event: RpcEvent;
	readonly isAuthorized: () => boolean;
}>;

const EVENT_IS_AUTHORITATIVE = (): boolean => true;

/** Delivers one Owner's events through a non-reentrant FIFO. */
export class RpcEventPublisherImpl implements IRpcEventPublisher {
	readonly #subscribers = new Set<Subscriber<RpcEvent>>();
	readonly #publications: RpcEventPublication[] = [];
	#dispatching = false;
	#completionRequested = false;
	#completed = false;
	readonly event$: Observable<RpcEvent>;

	constructor() {
		this.event$ = new Observable((subscriber) => {
			if (this.#completed) {
				subscriber.complete();
				return;
			}
			this.#subscribers.add(subscriber);
			return () => this.#subscribers.delete(subscriber);
		});
	}

	/** Enqueues one committed event with optional revocable publication authority. */
	publish(
		event: RpcEvent,
		isAuthorized: () => boolean = EVENT_IS_AUTHORITATIVE,
	): void {
		if (this.#completionRequested) {
			return;
		}
		this.#publications.push({ event, isAuthorized });
		this.#flush();
	}

	/** Completes after every earlier authoritative event has been delivered. */
	complete(): void {
		if (this.#completionRequested) {
			return;
		}
		this.#completionRequested = true;
		this.#flush();
	}

	#flush(): void {
		if (this.#dispatching) {
			return;
		}
		this.#dispatching = true;
		try {
			while (this.#publications.length > 0) {
				const publication = this.#publications.shift();
				if (publication === undefined || !publication.isAuthorized()) {
					continue;
				}
				for (const subscriber of [...this.#subscribers]) {
					if (!publication.isAuthorized()) {
						break;
					}
					subscriber.next(publication.event);
				}
			}
		} finally {
			this.#dispatching = false;
		}
		if (!this.#completionRequested || this.#completed) {
			return;
		}
		this.#completed = true;
		for (const subscriber of [...this.#subscribers]) {
			subscriber.complete();
		}
		this.#subscribers.clear();
	}
}
