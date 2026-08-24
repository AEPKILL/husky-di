/**
 * @overview One-shot RxJS source acquisition, subscription, fencing, and release adapter.
 * @author AEPKILL
 * @created 2026-08-24 22:15:00
 */

import {
	isObservable,
	type Observable,
	Subscriber,
	type Subscription,
	type TeardownLogic,
} from "rxjs";

import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolIncomingStream,
	IRpcProtocolSourceSink,
	RpcIncomingStreamTerminal,
	RpcSourceTerminal,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { RpcStreamRoute } from "@/types/rpc-exposure.type";
import { normalizeRpcApplicationValue } from "@/utils/rpc-application-value.util";

function isSourceSubscription(value: unknown): value is Subscription {
	try {
		return (
			typeof value === "object" &&
			value !== null &&
			typeof Reflect.get(value, "closed") === "boolean" &&
			typeof Reflect.get(value, "unsubscribe") === "function"
		);
	} catch {
		return false;
	}
}

class RpcSourceSubscriber extends Subscriber<unknown> {
	#teardownFailed = false;

	get teardownFailed(): boolean {
		return this.#teardownFailed;
	}

	override add(teardown: TeardownLogic): void {
		try {
			super.add(teardown);
		} catch {
			this.#teardownFailed = true;
		}
	}
}

/** Owns at most one Source Subscription and one truthful release receipt. */
export class RpcSourceSubscriptionImpl implements IRpcProtocolIncomingStream {
	#route: RpcStreamRoute | undefined;
	#argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined;
	#source: IRpcProtocolSourceSink | undefined;
	#sourceSubscriber: Subscriber<unknown> | undefined;
	#sourceSubscription: Subscription | undefined;
	#removeQueuedJob: (() => void) | undefined;
	#onReleased: (() => void) | undefined;
	readonly #onProtocolFault: (error: unknown) => void;
	readonly #releaseSourceRoot: () => void;
	readonly #onFinished: (
		outcome: RpcIncomingStreamTerminal,
		finishedAt: number,
		admittedItemCount: number,
		sourceTeardownFailed: boolean,
	) => void;
	#starting = false;
	#started = false;
	#finishRequested = false;
	#finishOutcome: RpcIncomingStreamTerminal | undefined;
	#finishedAt = 0;
	#admittedItemCount = 0;
	#emissionInProgress = false;
	#teardownAttempted = false;
	#sourceTeardownFailed = false;
	#released = false;

	constructor(
		route: RpcStreamRoute,
		argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined,
		source: IRpcProtocolSourceSink,
		onProtocolFault: (error: unknown) => void,
		releaseSourceRoot: () => void,
		onFinished: (
			outcome: RpcIncomingStreamTerminal,
			finishedAt: number,
			admittedItemCount: number,
			sourceTeardownFailed: boolean,
		) => void,
	) {
		this.#route = route;
		this.#argumentsSnapshot = argumentsSnapshot;
		this.#source = source;
		this.#onProtocolFault = onProtocolFault;
		this.#releaseSourceRoot = releaseSourceRoot;
		this.#onFinished = onFinished;
	}

	/** Arms cancellation of the one queued Source Start Job. */
	setQueuedJobRemoval(removeQueuedJob: () => void): void {
		this.#removeQueuedJob = removeQueuedJob;
		if (this.#finishRequested && !this.#started) {
			this.#removeQueuedJob();
			this.#removeQueuedJob = undefined;
			this.#release();
		}
	}

	/** Runs one Source Start Job and releases its scheduler permit synchronously. */
	start(releasePermit: () => void): boolean {
		this.#removeQueuedJob = undefined;
		if (this.#started || this.#finishRequested) {
			return false;
		}
		this.#started = true;
		this.#starting = true;
		const route = this.#route;
		const argumentsSnapshot = this.#argumentsSnapshot;
		try {
			let observable: Observable<unknown>;
			try {
				const candidate = this.#acquireSource(route, argumentsSnapshot);
				if (this.#finishRequested) {
					return true;
				}
				if (!isObservable(candidate)) {
					this.#reportSourceFailure();
					return true;
				}
				observable = candidate;
			} catch {
				if (!this.#finishRequested) {
					this.#reportSourceFailure();
				}
				return true;
			}

			const sourceSubscriber = new RpcSourceSubscriber({
				next: (value) => this.#emit(value),
				error: () => this.#reportSourceFailure(),
				complete: () => this.#finishSource({ type: "completed" }),
			});
			this.#sourceSubscriber = sourceSubscriber;
			let returnedSubscription: unknown;
			try {
				returnedSubscription = Reflect.apply(observable.subscribe, observable, [
					sourceSubscriber,
				]);
			} catch {
				if (!this.#finishRequested) {
					this.#reportSourceFailure();
				}
				return true;
			}
			this.#sourceTeardownFailed ||= sourceSubscriber.teardownFailed;
			if (!isSourceSubscription(returnedSubscription)) {
				if (!this.#finishRequested) {
					this.#reportSourceFailure();
				}
				return true;
			}
			this.#sourceSubscription = returnedSubscription;
			return true;
		} finally {
			this.#route = undefined;
			this.#argumentsSnapshot = undefined;
			this.#starting = false;
			releasePermit();
			if (this.#finishRequested) {
				this.#teardownAndRelease();
			}
		}
	}

	finish(outcome: RpcIncomingStreamTerminal, onReleased: () => void): void {
		if (this.#finishRequested) {
			return;
		}
		this.#finishRequested = true;
		this.#finishOutcome = outcome;
		this.#finishedAt = Date.now();
		this.#onReleased = onReleased;
		this.#route = undefined;
		this.#argumentsSnapshot = undefined;
		this.#removeQueuedJob?.();
		this.#removeQueuedJob = undefined;
		if (!this.#starting && !this.#emissionInProgress) {
			this.#teardownAndRelease();
		}
	}

	#acquireSource(
		route: RpcStreamRoute | undefined,
		argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined,
	): unknown {
		if (route === undefined) {
			throw new TypeError("RPC stream route was released before acquisition.");
		}
		if (route.kind === "stream-method") {
			if (argumentsSnapshot === undefined) {
				throw new TypeError("RPC stream method arguments were not retained.");
			}
			return Reflect.apply(route.handler, route.implementation, [
				...argumentsSnapshot.value,
			]);
		}
		if (route.sourceKind === "data") {
			return route.source;
		}
		return Reflect.apply(route.getter, route.implementation, []);
	}

	#emit(value: unknown): void {
		if (this.#finishRequested) {
			return;
		}
		const source = this.#source;
		if (source === undefined) {
			return;
		}
		let emission: ReturnType<IRpcProtocolSourceSink["reserveEmission"]>;
		try {
			emission = source.reserveEmission();
		} catch (error) {
			this.#onProtocolFault(error);
			return;
		}
		if (emission === undefined || this.#finishRequested) {
			return;
		}
		let snapshot: ReturnType<typeof normalizeRpcApplicationValue>;
		try {
			snapshot = normalizeRpcApplicationValue(value);
		} catch {
			try {
				emission.fail();
			} catch (protocolError) {
				this.#onProtocolFault(protocolError);
				return;
			}
			if (!this.#finishRequested) {
				this.#reportSourceFailure();
			}
			return;
		}
		if (this.#finishRequested) {
			return;
		}
		this.#emissionInProgress = true;
		try {
			emission.commit(snapshot);
			this.#admittedItemCount = Math.min(
				Number.MAX_SAFE_INTEGER,
				this.#admittedItemCount + 1,
			);
		} catch (error) {
			this.#onProtocolFault(error);
		} finally {
			this.#emissionInProgress = false;
			if (this.#finishRequested && !this.#starting) {
				this.#teardownAndRelease();
			}
		}
	}

	#reportSourceFailure(): void {
		this.#finishSource({
			type: "failed",
			code: RpcExceptionCodeEnum.handlerFailed,
		});
	}

	#finishSource(outcome: RpcSourceTerminal): void {
		if (this.#finishRequested) {
			return;
		}
		try {
			this.#source?.finish(outcome);
		} catch (error) {
			this.#onProtocolFault(error);
		}
	}

	#attemptTeardown(subscription: Subscription | undefined): void {
		if (subscription === undefined || this.#teardownAttempted) {
			return;
		}
		this.#teardownAttempted = true;
		try {
			subscription.unsubscribe();
		} catch {
			this.#sourceTeardownFailed = true;
		}
	}

	#teardownAndRelease(): void {
		this.#attemptTeardown(this.#sourceSubscription ?? this.#sourceSubscriber);
		this.#sourceSubscription = undefined;
		this.#sourceSubscriber = undefined;
		this.#source = undefined;
		this.#release();
	}

	#release(): void {
		if (this.#released) {
			return;
		}
		this.#released = true;
		const onReleased = this.#onReleased;
		const finishOutcome = this.#finishOutcome;
		this.#onReleased = undefined;
		this.#finishOutcome = undefined;
		let releaseError: unknown;
		try {
			onReleased?.();
		} catch (error) {
			releaseError = error;
		} finally {
			this.#releaseSourceRoot();
		}
		if (finishOutcome !== undefined) {
			this.#onFinished(
				finishOutcome,
				this.#finishedAt,
				this.#admittedItemCount,
				this.#sourceTeardownFailed,
			);
		}
		if (releaseError !== undefined) {
			this.#onProtocolFault(releaseError);
		}
	}
}
