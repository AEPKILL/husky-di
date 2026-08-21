/**
 * @overview Supervises one Connector's initial and recovery connection attempts.
 * @author AEPKILL
 * @created 2026-08-21 02:14:00
 */

import { type Observable, ReplaySubject, Subject, Subscription } from "rxjs";

import { RpcConnectorReconnectionAttemptFailureStageEnum } from "@/enums/rpc-connector-reconnection-attempt-failure-stage.enum";
import { RpcConnectorReconnectionEventTypeEnum } from "@/enums/rpc-connector-reconnection-event-type.enum";
import { RpcConnectorReconnectionStopReasonEnum } from "@/enums/rpc-connector-reconnection-stop-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { IRpcConnector } from "@/interfaces/rpc-caller.interface";
import type { IRpcConnectorReconnection } from "@/interfaces/rpc-connector-reconnection.interface";
import type {
	RpcConnectorAdapterFactory,
	RpcConnectorReconnectionEvent,
	RpcConnectorReconnectionPolicy,
	RpcConnectorReconnectionState,
} from "@/types/rpc-connector-reconnection.type";

const maximumPlatformTimerDelayMs = 2_147_483_647;

/** Supervises the connection-attempt authority of one Connector. */
export class RpcConnectorReconnectionImpl implements IRpcConnectorReconnection {
	readonly connector: IRpcConnector;
	readonly #adapterFactory: RpcConnectorAdapterFactory;
	readonly #policy: RpcConnectorReconnectionPolicy;
	#stateValue: RpcConnectorReconnectionState = Object.freeze({
		status: RpcStateStatusEnum.idle,
	});
	readonly #stateSubject = new ReplaySubject<RpcConnectorReconnectionState>(1);
	readonly state$: Observable<RpcConnectorReconnectionState>;
	readonly #eventSubject = new Subject<RpcConnectorReconnectionEvent>();
	readonly event$: Observable<RpcConnectorReconnectionEvent>;
	#lifecycleSubscription: Subscription | undefined;
	#retryTimer: ReturnType<typeof setTimeout> | undefined;
	#attemptController: AbortController | undefined;
	#attemptTimer: ReturnType<typeof setTimeout> | undefined;
	#attemptTask: Promise<void> | undefined;
	#stopTask: Promise<void> | undefined;

	constructor(
		connector: IRpcConnector,
		adapterFactory: RpcConnectorAdapterFactory,
		policy: RpcConnectorReconnectionPolicy,
	) {
		this.connector = connector;
		this.#adapterFactory = adapterFactory;
		this.#policy = policy;
		this.state$ = this.#stateSubject.asObservable();
		this.event$ = this.#eventSubject.asObservable();
		this.#stateSubject.next(this.#stateValue);
	}

	get state(): RpcConnectorReconnectionState {
		return this.#stateValue;
	}

	connect(): Promise<void> {
		if (this.state.status !== RpcStateStatusEnum.idle) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}

		this.#installLifecycleSubscriptions();
		if (this.#readState().status === RpcStateStatusEnum.stopped) {
			return Promise.reject(this.#createAttemptAbortError());
		}
		this.#publishState(
			Object.freeze({ status: RpcStateStatusEnum.connecting }),
		);
		if (this.#readState().status === RpcStateStatusEnum.stopped) {
			return Promise.reject(this.#createAttemptAbortError());
		}
		let adapter: ReturnType<RpcConnectorAdapterFactory>;
		try {
			adapter = this.#adapterFactory();
		} catch (error) {
			this.#commitStopped(this.#readInitialFailureReason());
			return Promise.reject(error);
		}
		if (this.#readState().status === RpcStateStatusEnum.stopped) {
			return Promise.reject(this.#createAttemptAbortError());
		}

		const controller = new AbortController();
		this.#attemptController = controller;
		const attemptTask = this.#startConnectorAttempt(adapter, controller);
		return attemptTask.then(
			() => {
				this.#finishAttempt(controller, attemptTask);
				if (this.state.status === RpcStateStatusEnum.stopped) {
					return;
				}
				this.#publishState(
					Object.freeze({ status: RpcStateStatusEnum.monitoring }),
				);
				this.#observePeerState();
			},
			(error: unknown) => {
				this.#finishAttempt(controller, attemptTask);
				if (this.state.status !== RpcStateStatusEnum.stopped) {
					this.#commitStopped(this.#readInitialFailureReason());
				}
				throw error;
			},
		);
	}

	stop(): Promise<void> {
		if (this.#stopTask !== undefined) {
			return this.#stopTask;
		}
		this.#stopTask = this.#attemptTask?.catch(() => {}) ?? Promise.resolve();
		this.#commitStopped(RpcConnectorReconnectionStopReasonEnum.requested);
		return this.#stopTask;
	}

	#beginRecovery(): void {
		this.#publishState(
			Object.freeze({
				status: RpcStateStatusEnum.reconnecting,
				attempt: 1,
			}),
		);
		queueMicrotask(() => this.#runRecoveryAttempt(1));
	}

	#runRecoveryAttempt(attemptNumber: number): void {
		if (
			this.state.status !== RpcStateStatusEnum.reconnecting ||
			this.state.attempt !== attemptNumber
		) {
			return;
		}
		let adapter: ReturnType<RpcConnectorAdapterFactory>;
		try {
			adapter = this.#adapterFactory();
		} catch {
			this.#handleRecoveryFailure(
				attemptNumber,
				RpcConnectorReconnectionAttemptFailureStageEnum.adapterFactory,
			);
			return;
		}
		if (
			this.state.status !== RpcStateStatusEnum.reconnecting ||
			this.state.attempt !== attemptNumber
		) {
			return;
		}
		const controller = new AbortController();
		this.#attemptController = controller;
		this.#scheduleAttemptTimeout(controller, this.#policy.attemptTimeoutMs);
		const attemptTask = this.#startConnectorAttempt(adapter, controller);
		void attemptTask.then(
			() => {
				this.#finishAttempt(controller, attemptTask);
				if (
					this.state.status === RpcStateStatusEnum.reconnecting &&
					this.state.attempt === attemptNumber
				) {
					this.#publishState(
						Object.freeze({ status: RpcStateStatusEnum.monitoring }),
					);
					this.#observePeerState();
				}
			},
			() => {
				const stage = controller.signal.aborted
					? RpcConnectorReconnectionAttemptFailureStageEnum.attemptTimeout
					: RpcConnectorReconnectionAttemptFailureStageEnum.connectorAttempt;
				this.#finishAttempt(controller, attemptTask);
				this.#handleRecoveryFailure(attemptNumber, stage);
			},
		);
	}

	#finishAttempt(
		controller: AbortController,
		attemptTask: Promise<void>,
	): void {
		if (this.#attemptTask === attemptTask) {
			this.#attemptTask = undefined;
		}
		if (this.#attemptController !== controller) {
			return;
		}
		if (this.#attemptTimer !== undefined) {
			clearTimeout(this.#attemptTimer);
			this.#attemptTimer = undefined;
		}
		this.#attemptController = undefined;
	}

	#handleRecoveryFailure(
		attemptNumber: number,
		stage: RpcConnectorReconnectionAttemptFailureStageEnum,
	): void {
		if (
			this.state.status !== RpcStateStatusEnum.reconnecting ||
			this.state.attempt !== attemptNumber
		) {
			return;
		}
		const delayMs = this.#policy.retryDelaysMs[attemptNumber - 1];
		if (delayMs === undefined) {
			this.#commitStopped(
				RpcConnectorReconnectionStopReasonEnum.retriesExhausted,
				false,
			);
			this.#emitAttemptFailure(attemptNumber, stage);
			this.#eventSubject.complete();
			return;
		}
		const nextAttempt = attemptNumber + 1;
		this.#publishState(
			Object.freeze({
				status: RpcStateStatusEnum.waiting,
				nextAttempt,
				delayMs,
			}),
		);
		const waitingState = this.#readState();
		if (
			waitingState.status !== RpcStateStatusEnum.waiting ||
			waitingState.nextAttempt !== nextAttempt
		) {
			return;
		}
		this.#scheduleRetry(nextAttempt, delayMs);
		this.#emitAttemptFailure(attemptNumber, stage, delayMs);
	}

	#scheduleRetry(nextAttempt: number, remainingMs: number): void {
		const delayMs = Math.min(remainingMs, maximumPlatformTimerDelayMs);
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = undefined;
			if (
				this.state.status !== RpcStateStatusEnum.waiting ||
				this.state.nextAttempt !== nextAttempt
			) {
				return;
			}
			const nextRemainingMs = remainingMs - delayMs;
			if (nextRemainingMs > 0) {
				this.#scheduleRetry(nextAttempt, nextRemainingMs);
				return;
			}
			this.#publishState(
				Object.freeze({
					status: RpcStateStatusEnum.reconnecting,
					attempt: nextAttempt,
				}),
			);
			queueMicrotask(() => this.#runRecoveryAttempt(nextAttempt));
		}, delayMs);
	}

	#scheduleAttemptTimeout(
		controller: AbortController,
		remainingMs: number,
	): void {
		const delayMs = Math.min(remainingMs, maximumPlatformTimerDelayMs);
		this.#attemptTimer = setTimeout(() => {
			this.#attemptTimer = undefined;
			if (this.#attemptController !== controller) {
				return;
			}
			const nextRemainingMs = remainingMs - delayMs;
			if (nextRemainingMs > 0) {
				this.#scheduleAttemptTimeout(controller, nextRemainingMs);
				return;
			}
			controller.abort();
		}, delayMs);
	}

	#installLifecycleSubscriptions(): void {
		if (
			this.connector.state.status !== RpcStateStatusEnum.active ||
			this.connector.peer.state.status === RpcStateStatusEnum.closed
		) {
			this.#commitStopped(
				RpcConnectorReconnectionStopReasonEnum.connectorTerminated,
			);
			return;
		}

		const subscription = new Subscription();
		this.#lifecycleSubscription = subscription;
		subscription.add(
			this.connector.state$.subscribe((state) => {
				if (state.status !== RpcStateStatusEnum.active) {
					this.#commitStopped(
						RpcConnectorReconnectionStopReasonEnum.connectorTerminated,
					);
				}
			}),
		);
		if (this.#readState().status === RpcStateStatusEnum.stopped) {
			return;
		}

		subscription.add(
			this.connector.peer.state$.subscribe(() => this.#observePeerState()),
		);
		if (this.#readState().status !== RpcStateStatusEnum.stopped) {
			this.#observePeerState();
		}
	}

	#observePeerState(): void {
		const peerState = this.connector.peer.state;
		if (peerState.status === RpcStateStatusEnum.closed) {
			this.#commitStopped(
				RpcConnectorReconnectionStopReasonEnum.connectorTerminated,
			);
			return;
		}
		if (
			peerState.status === RpcStateStatusEnum.recovering &&
			this.state.status === RpcStateStatusEnum.monitoring
		) {
			this.#beginRecovery();
		}
	}

	#publishState(state: RpcConnectorReconnectionState): void {
		this.#stateValue = state;
		this.#stateSubject.next(state);
	}

	#readState(): RpcConnectorReconnectionState {
		return this.#stateValue;
	}

	#startConnectorAttempt(
		adapter: ReturnType<RpcConnectorAdapterFactory>,
		controller: AbortController,
	): Promise<void> {
		const attempt = Promise.withResolvers<void>();
		this.#attemptTask = attempt.promise;
		Promise.try(() =>
			this.connector.connect({ adapter, signal: controller.signal }),
		).then(attempt.resolve, attempt.reject);
		return attempt.promise;
	}

	#readInitialFailureReason(): RpcConnectorReconnectionStopReasonEnum {
		return this.connector.state.status === RpcStateStatusEnum.active &&
			this.connector.peer.state.status !== RpcStateStatusEnum.closed
			? RpcConnectorReconnectionStopReasonEnum.initialConnectionFailed
			: RpcConnectorReconnectionStopReasonEnum.connectorTerminated;
	}

	#createAttemptAbortError(): DOMException {
		return new DOMException(
			"The connection attempt was stopped.",
			"AbortError",
		);
	}

	#emitAttemptFailure(
		attempt: number,
		stage: RpcConnectorReconnectionAttemptFailureStageEnum,
		nextDelayMs?: number,
	): void {
		this.#eventSubject.next(
			Object.freeze({
				type: RpcConnectorReconnectionEventTypeEnum.attemptFailed,
				attempt,
				stage,
				...(nextDelayMs === undefined ? {} : { nextDelayMs }),
			}),
		);
	}

	#commitStopped(
		reason: RpcConnectorReconnectionStopReasonEnum,
		completeEvents = true,
	): void {
		if (this.state.status === RpcStateStatusEnum.stopped) {
			return;
		}
		this.#lifecycleSubscription?.unsubscribe();
		this.#lifecycleSubscription = undefined;
		if (this.#retryTimer !== undefined) {
			clearTimeout(this.#retryTimer);
			this.#retryTimer = undefined;
		}
		this.#attemptController?.abort();
		this.#attemptController = undefined;
		if (this.#attemptTimer !== undefined) {
			clearTimeout(this.#attemptTimer);
			this.#attemptTimer = undefined;
		}
		this.#publishState(
			Object.freeze({ status: RpcStateStatusEnum.stopped, reason }),
		);
		this.#stateSubject.complete();
		if (completeEvents) {
			this.#eventSubject.complete();
		}
	}
}
