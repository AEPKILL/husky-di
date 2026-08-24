/**
 * @overview Stable caller-facing RPC Peer implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { Observable, type Subscriber, type TeardownLogic } from "rxjs";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import { RpcEventDirectionEnum } from "@/enums/rpc-event-direction.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { RpcStreamStatusEnum } from "@/enums/rpc-stream-status.enum";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import { createRpcException } from "@/factories/rpc-exception.factory";
import { createRpcSourceSubscription } from "@/factories/rpc-source-subscription.factory";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolIncomingStream,
	IRpcProtocolSession,
	IRpcProtocolSourceSink,
	IRpcProtocolStream,
	IRpcProtocolSubscriberSink,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolIncomingCallReservation,
	RpcProtocolIncomingStreamReservation,
	RpcProtocolStreamRequest,
	RpcStreamOutcome,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type { IRpcApplicationWorkReservation } from "@/interfaces/rpc-application-work-ledger.interface";
import type { RpcEvent } from "@/interfaces/rpc-caller.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/rpc-handler-scheduler.interface";
import type {
	IRpcPeerCommittedInvocation,
	IRpcPeerInvocationReservation,
	IRpcPeerRuntime,
} from "@/interfaces/rpc-peer.interface";
import type {
	RemoteService,
	RemoteServiceImplementation,
	RpcMemberDefinitions,
} from "@/types/remote-service-descriptor.type";
import type { RpcPeerState } from "@/types/rpc-caller.type";
import type {
	RpcExposureRegistry,
	RpcHandlerRoute,
	RpcStreamRoute,
} from "@/types/rpc-exposure.type";
import type { CreateRpcPeerOptions } from "@/types/rpc-peer.type";
import {
	isRpcApplicationArgumentsSnapshot,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
} from "@/utils/rpc-application-value.util";
import {
	installRpcAbortListener,
	prepareRpcInvocationArguments,
} from "@/utils/rpc-cancellation.util";
import { installRpcExposure } from "@/utils/rpc-exposure.util";
import { createRpcFacade } from "@/utils/rpc-facade.util";
import {
	createRpcExpectedUnknownTerminalSchema,
	rpcCallOutcomeSchema,
	rpcCommittedInvocationSchema,
	rpcHandlerTerminalSchema,
	rpcIncomingCallRequestSchema,
	rpcInvocationReservationSchema,
} from "@/utils/rpc-schema.util";

let nextObservationOrdinal = 0;

function createObservationId(): string {
	nextObservationOrdinal += 1;
	return `rpc-observation-${nextObservationOrdinal}`;
}

function observationDuration(
	startedAt: number,
	finishedAt = Date.now(),
): number {
	const duration = finishedAt - startedAt;
	if (!Number.isFinite(duration)) {
		return 0;
	}
	return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(duration)));
}

function incrementObservationCount(count: number): number {
	return Math.min(Number.MAX_SAFE_INTEGER, count + 1);
}

function invokeRpcHandler(
	route: RpcHandlerRoute,
	argumentsSnapshot: IRpcApplicationArgumentsSnapshot,
	abortSignal: AbortSignal,
): unknown {
	const invocationArguments: unknown[] = [...argumentsSnapshot.value];
	if (route.cancelable) {
		invocationArguments.push(abortSignal);
	}
	return Reflect.apply(
		route.handler,
		route.implementation,
		invocationArguments,
	);
}

interface IProtocolFieldsSnapshot {
	readonly fieldNames: readonly string[];
	readonly fields: Readonly<Record<string, unknown>>;
}

function readProtocolFields(
	value: unknown,
): IProtocolFieldsSnapshot | undefined {
	try {
		if (typeof value !== "object" || value === null) {
			return undefined;
		}
		const prototype = Reflect.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			return undefined;
		}
		const fieldNames: string[] = [];
		const fields = Object.create(null) as Record<string, unknown>;
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") {
				return undefined;
			}
			const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
			if (descriptor === undefined || !("value" in descriptor)) {
				return undefined;
			}
			fieldNames.push(key);
			fields[key] = descriptor.value;
		}
		return { fieldNames, fields };
	} catch {
		return undefined;
	}
}

function isRpcCallOutcome(value: unknown): value is RpcCallOutcome {
	const fields = readProtocolFields(value);
	return fields !== undefined && rpcCallOutcomeSchema.safeParse(fields).success;
}

function isExpectedUnknownTerminal(
	value: unknown,
	code: RpcUnknownCallFailure,
): value is RpcIncomingTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		createRpcExpectedUnknownTerminalSchema(code).safeParse(fields).success
	);
}

type RpcHandlerTerminal =
	| { readonly type: RpcCallTerminalTypeEnum.returnedVoid }
	| {
			readonly type: RpcCallTerminalTypeEnum.returned;
			readonly value: IRpcApplicationSnapshot;
	  }
	| {
			readonly type: RpcCallTerminalTypeEnum.failed;
			readonly code:
				| RpcExceptionCodeEnum.canceled
				| RpcExceptionCodeEnum.handlerFailed;
	  }
	| { readonly type: RpcCallTerminalTypeEnum.sessionTerminated };

function isHandlerTerminal(value: unknown): value is RpcHandlerTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined && rpcHandlerTerminalSchema.safeParse(fields).success
	);
}

function isIncomingCallRequest(
	value: unknown,
): value is IRpcProtocolIncomingCallRequest {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		rpcIncomingCallRequestSchema.safeParse(fields).success
	);
}

function isIncomingStreamRequest(
	value: unknown,
): value is RpcProtocolStreamRequest {
	const fields = readProtocolFields(value);
	if (fields === undefined) {
		return false;
	}
	const { fieldNames, fields: values } = fields;
	const baseIsValid =
		typeof values.service === "string" &&
		values.service.length > 0 &&
		typeof values.member === "string" &&
		values.member.length > 0 &&
		values.member !== "then";
	if (!baseIsValid) {
		return false;
	}
	if (values.kind === "stream-property") {
		return (
			fieldNames.length === 3 &&
			fieldNames.every((name) => ["service", "member", "kind"].includes(name))
		);
	}
	return (
		values.kind === "stream-method" &&
		fieldNames.length === 4 &&
		fieldNames.every((name) =>
			["service", "member", "kind", "args"].includes(name),
		) &&
		isRpcApplicationArgumentsSnapshot(values.args)
	);
}

/** Retains one stable Peer identity and its replay-latest state snapshot. */
export class RpcPeerImpl implements IRpcPeerRuntime {
	readonly #stateSubscribers = new Set<Subscriber<RpcPeerState>>();
	readonly #localExposureRegistry: RpcExposureRegistry = new Map();
	readonly #ownerExposureRegistry: RpcExposureRegistry;
	readonly #isOwnerActive: () => boolean;
	readonly #emitEvent: (event: RpcEvent) => void;
	readonly #onProtocolFault: (error: Error) => void;
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #maximumActiveStreamsPerSession: number;
	readonly #maximumApplicationWorkPerSession: number;
	readonly #maximumIncomingBytes: number;
	readonly #reserveLocalApplicationWork: (
		stream: boolean,
	) => IRpcApplicationWorkReservation | undefined;
	readonly #reserveRemoteApplicationWork: (
		stream: boolean,
	) => IRpcApplicationWorkReservation | undefined;
	readonly #reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	#state: RpcPeerState;
	#stateDirty = false;
	#stateCompleted = false;
	#stateGeneration = 0;
	#session: IRpcProtocolSession | undefined;
	#incomingReservationBytes = 0;
	#localApplicationWork = 0;
	#localActiveStreams = 0;
	#remoteApplicationWork = 0;
	#remoteActiveStreams = 0;
	readonly #applicationWorkReservations =
		new Set<IRpcApplicationWorkReservation>();
	readonly state$: Observable<RpcPeerState>;

	constructor(options: CreateRpcPeerOptions) {
		const {
			emitEvent,
			handlerScheduler,
			initialState,
			isOwnerActive,
			maximumActiveStreamsPerSession,
			maximumApplicationWorkPerSession,
			maximumIncomingBytes,
			onProtocolFault,
			ownerExposureRegistry,
			reserveLocalApplicationWork,
			reserveRemoteApplicationWork,
			reserveRetainedBytes,
		} = options;
		this.#state = Object.freeze(initialState);
		this.#ownerExposureRegistry = ownerExposureRegistry;
		this.#isOwnerActive = isOwnerActive;
		this.#emitEvent = emitEvent;
		this.#onProtocolFault = onProtocolFault;
		this.#handlerScheduler = handlerScheduler;
		this.#maximumActiveStreamsPerSession = maximumActiveStreamsPerSession;
		this.#maximumApplicationWorkPerSession = maximumApplicationWorkPerSession;
		this.#maximumIncomingBytes = maximumIncomingBytes;
		this.#reserveLocalApplicationWork = reserveLocalApplicationWork;
		this.#reserveRemoteApplicationWork = reserveRemoteApplicationWork;
		this.#reserveRetainedBytes = reserveRetainedBytes;
		this.state$ = new Observable((subscriber) => {
			if (this.#stateCompleted) {
				subscriber.complete();
				return;
			}
			this.#stateSubscribers.add(subscriber);
			if (!subscriber.closed) {
				subscriber.next(this.#state);
			}
			return () => this.#stateSubscribers.delete(subscriber);
		});
	}

	get state(): RpcPeerState {
		return this.#state;
	}

	/** Package-private atomic state projection used by its owning topology. */
	commitState(state: RpcPeerState): void {
		this.stageState(state);
		this.flushState();
	}

	/** Package-private state commit that defers notifications until the Owner batch is complete. */
	stageState(state: RpcPeerState): void {
		if (this.state.status === RpcStateStatusEnum.closed) {
			return;
		}
		this.#state = Object.freeze(state);
		this.#stateDirty = true;
		this.#stateGeneration += 1;
	}

	/** Package-private notification flush for a previously staged state. */
	flushState(): void {
		if (!this.#stateDirty) {
			return;
		}
		this.#stateDirty = false;
		const generation = this.#stateGeneration;
		const state = this.#state;
		for (const subscriber of [...this.#stateSubscribers]) {
			if (generation !== this.#stateGeneration) {
				return;
			}
			subscriber.next(state);
		}
	}

	/** Package-private terminal cleanup after the final snapshot is committed. */
	completeState(): void {
		if (this.#stateCompleted) {
			return;
		}
		this.flushState();
		this.#stateCompleted = true;
		this.#localExposureRegistry.clear();
		this.#session = undefined;
		for (const reservation of [...this.#applicationWorkReservations]) {
			reservation.release();
		}
		this.#stateGeneration += 1;
		for (const subscriber of [...this.#stateSubscribers]) {
			subscriber.complete();
		}
		this.#stateSubscribers.clear();
	}

	#reserveApplicationWork(
		direction: "local" | "remote",
		stream: boolean,
	): IRpcApplicationWorkReservation | undefined {
		const work =
			direction === "local"
				? this.#localApplicationWork
				: this.#remoteApplicationWork;
		const activeStreams =
			direction === "local"
				? this.#localActiveStreams
				: this.#remoteActiveStreams;
		// Work and its stream subset must be acquired as one Session reservation.
		const sessionCapacityUnavailable =
			work >= this.#maximumApplicationWorkPerSession ||
			(stream && activeStreams >= this.#maximumActiveStreamsPerSession);
		if (sessionCapacityUnavailable) {
			return undefined;
		}
		const ownerReservation =
			direction === "local"
				? this.#reserveLocalApplicationWork(stream)
				: this.#reserveRemoteApplicationWork(stream);
		if (ownerReservation === undefined) {
			return undefined;
		}
		if (direction === "local") {
			this.#localApplicationWork += 1;
			if (stream) {
				this.#localActiveStreams += 1;
			}
		} else {
			this.#remoteApplicationWork += 1;
			if (stream) {
				this.#remoteActiveStreams += 1;
			}
		}
		let released = false;
		const reservation = Object.freeze<IRpcApplicationWorkReservation>({
			release: () => {
				if (released) {
					return;
				}
				released = true;
				this.#applicationWorkReservations.delete(reservation);
				ownerReservation.release();
				if (direction === "local") {
					this.#localApplicationWork -= 1;
					if (stream) {
						this.#localActiveStreams -= 1;
					}
				} else {
					this.#remoteApplicationWork -= 1;
					if (stream) {
						this.#remoteActiveStreams -= 1;
					}
				}
			},
		});
		this.#applicationWorkReservations.add(reservation);
		return reservation;
	}

	expose<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		// Exposure changes require an active owner and a non-terminal Peer.
		const cannotExposeService =
			!this.#isOwnerActive() ||
			this.state.status === RpcStateStatusEnum.draining ||
			this.state.status === RpcStateStatusEnum.closed;
		if (cannotExposeService) {
			throw createRpcException(RpcExceptionCodeEnum.unavailable);
		}
		return installRpcExposure(
			descriptor,
			implementation,
			this.#localExposureRegistry,
			[this.#ownerExposureRegistry],
		);
	}

	resolve<T, Definitions extends RpcMemberDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
	): RemoteService<T, Definitions> {
		const service = getRemoteServiceDescriptorData(descriptor).wireName;
		return createRpcFacade(
			descriptor,
			(member, cancelable, actualArguments) =>
				this.#invoke(service, member, cancelable, actualArguments),
			(member, kind, actualArguments, subscriber) =>
				this.#subscribe(service, member, kind, actualArguments, subscriber),
		);
	}

	#subscribe(
		service: string,
		member: string,
		kind: "stream-method" | "stream-property",
		actualArguments: readonly unknown[],
		subscriber: Subscriber<unknown>,
	): TeardownLogic {
		const session = this.#session;
		// Subscription preflight rejects state before inspecting application arguments.
		const cannotSubscribe =
			!this.#isOwnerActive() ||
			(this.state.status !== RpcStateStatusEnum.connected &&
				this.state.status !== RpcStateStatusEnum.recovering) ||
			session === undefined;
		if (cannotSubscribe) {
			subscriber.error(createRpcException(RpcExceptionCodeEnum.unavailable));
			return;
		}

		let request: RpcProtocolStreamRequest;
		try {
			request =
				kind === "stream-method"
					? {
							service,
							member,
							kind,
							args: normalizeRpcApplicationArguments(actualArguments),
						}
					: { service, member, kind };
		} catch (error) {
			subscriber.error(error);
			return;
		}
		if (subscriber.closed) {
			return;
		}
		const applicationWorkReservation = this.#reserveApplicationWork(
			"local",
			true,
		);
		if (applicationWorkReservation === undefined) {
			subscriber.error(createRpcException(RpcExceptionCodeEnum.unavailable));
			return;
		}
		let streamRootReleased = false;
		const releaseStreamRoot = (): void => {
			if (streamRootReleased) {
				return;
			}
			streamRootReleased = true;
			applicationWorkReservation.release();
		};

		let reservation: ReturnType<IRpcProtocolSession["reserveStream"]>;
		try {
			reservation = session.reserveStream(request);
		} catch (error) {
			releaseStreamRoot();
			subscriber.error(this.#protocolFailure(error));
			return;
		}
		if (reservation === undefined) {
			releaseStreamRoot();
			subscriber.error(createRpcException(RpcExceptionCodeEnum.unavailable));
			return;
		}
		if (!rpcInvocationReservationSchema.safeParse(reservation).success) {
			releaseStreamRoot();
			subscriber.error(
				this.#protocolFailure(new Error("Invalid stream reservation.")),
			);
			return;
		}
		if (subscriber.closed) {
			try {
				reservation.release();
			} catch (error) {
				this.#protocolFailure(error);
			}
			releaseStreamRoot();
			return;
		}

		const observationId = createObservationId();
		const startedAt = Date.now();
		let observationStarted = false;
		let observationFinished = false;
		let deliveredItemCount = 0;
		let terminalCommitted = false;
		let dispatching = false;
		let itemProjectionReserved = false;
		let projectionClosed = false;
		const deferredEffects: Array<() => void> = [];
		const runOrDefer = (effect: () => void): void => {
			if (dispatching || !observationStarted) {
				deferredEffects.push(effect);
				return;
			}
			effect();
		};
		const flushDeferredEffects = (): void => {
			if (dispatching || !observationStarted) {
				return;
			}
			while (deferredEffects.length > 0) {
				deferredEffects.shift()?.();
			}
		};
		const createFinishedEvent = (
			outcome: RpcStreamOutcome,
		): RpcEvent | undefined => {
			if (observationFinished) {
				return undefined;
			}
			observationFinished = true;
			const base = {
				type: RpcEventTypeEnum.streamFinished as const,
				observationId,
				peer: this,
				direction: RpcEventDirectionEnum.outgoing as const,
				service,
				member,
				deliveredItemCount,
				durationMs: observationDuration(startedAt),
			};
			if (outcome.type === "completed") {
				return { ...base, outcome: RpcStreamStatusEnum.completed };
			}
			if (outcome.type === "canceled") {
				return { ...base, outcome: RpcStreamStatusEnum.canceled };
			}
			return {
				...base,
				outcome: RpcStreamStatusEnum.failed,
				code: outcome.code,
			};
		};
		const closedItemProjection = Object.freeze({
			commit: () => "closed" as const,
		});
		const closedTerminalProjection = Object.freeze({
			commit: () => undefined,
		});
		const commitTerminal = (outcome: RpcStreamOutcome): void => {
			if (terminalCommitted || projectionClosed) {
				return;
			}
			terminalCommitted = true;
			const finishedEvent = createFinishedEvent(outcome);
			const effect = (): void => {
				try {
					if (finishedEvent !== undefined) {
						this.#emitEvent(finishedEvent);
					}
					if (subscriber.closed) {
						return;
					}
					if (outcome.type === "completed") {
						subscriber.complete();
						return;
					}
					const code =
						outcome.type === "canceled"
							? RpcExceptionCodeEnum.canceled
							: outcome.code;
					subscriber.error(createRpcException(code));
				} finally {
					releaseStreamRoot();
				}
			};
			runOrDefer(effect);
		};
		const sink: IRpcProtocolSubscriberSink = Object.freeze({
			reserveItem: (snapshot: IRpcApplicationSnapshot) => {
				if (terminalCommitted || projectionClosed || subscriber.closed) {
					return closedItemProjection;
				}
				// One W=1 item projection must settle before another begins.
				const itemProjectionOverlaps = dispatching || itemProjectionReserved;
				if (itemProjectionOverlaps) {
					projectionClosed = true;
					this.#protocolFailure(
						new Error("Protocol overlapped stream item projections."),
					);
					return closedItemProjection;
				}
				itemProjectionReserved = true;
				let committed = false;
				return Object.freeze({
					commit: () => {
						if (committed) {
							return "closed" as const;
						}
						committed = true;
						itemProjectionReserved = false;
						// A terminal, Session fault, or unsubscribe suppresses the reserved effect.
						const itemProjectionIsClosed =
							terminalCommitted || projectionClosed || subscriber.closed;
						if (itemProjectionIsClosed) {
							return "closed" as const;
						}
						deliveredItemCount = incrementObservationCount(deliveredItemCount);
						dispatching = true;
						try {
							subscriber.next(snapshot.value);
						} finally {
							dispatching = false;
							flushDeferredEffects();
						}
						return terminalCommitted || projectionClosed || subscriber.closed
							? ("closed" as const)
							: ("rearm" as const);
					},
				});
			},
			reserveTerminal: (outcome: RpcStreamOutcome) => {
				if (projectionClosed) {
					return closedTerminalProjection;
				}
				let committed = false;
				return Object.freeze({
					commit: () => {
						if (committed) {
							return;
						}
						committed = true;
						commitTerminal(outcome);
					},
				});
			},
		});

		let stream: IRpcProtocolStream;
		try {
			stream = reservation.commit(sink);
		} catch (error) {
			releaseStreamRoot();
			subscriber.error(this.#protocolFailure(error));
			return;
		}
		if (!rpcCommittedInvocationSchema.safeParse(stream).success) {
			releaseStreamRoot();
			subscriber.error(this.#protocolFailure(new Error("Invalid stream.")));
			return;
		}

		observationStarted = true;
		this.#emitEvent({
			type: RpcEventTypeEnum.streamStarted,
			observationId,
			peer: this,
			direction: RpcEventDirectionEnum.outgoing,
			service,
			member,
		});
		flushDeferredEffects();

		let canceled = false;
		const cancel = (): void => {
			if (terminalCommitted || canceled) {
				return;
			}
			canceled = true;
			const finishedEvent = createFinishedEvent({ type: "canceled" });
			if (finishedEvent !== undefined) {
				runOrDefer(() => this.#emitEvent(finishedEvent));
			}
			try {
				stream.cancel();
			} catch (error) {
				this.#protocolFailure(error);
			}
		};
		if (subscriber.closed) {
			cancel();
			return;
		}
		if (terminalCommitted) {
			return;
		}
		try {
			stream.start();
		} catch (error) {
			terminalCommitted = true;
			const finishedEvent = createFinishedEvent({
				type: "failed",
				code: RpcExceptionCodeEnum.outcomeUnknown,
			});
			if (finishedEvent !== undefined) {
				this.#emitEvent(finishedEvent);
			}
			releaseStreamRoot();
			subscriber.error(this.#protocolFailure(error));
			return;
		}
		return cancel;
	}

	#invoke(
		service: string,
		member: string,
		cancelable: boolean,
		actualArguments: readonly unknown[],
	): Promise<unknown> {
		const prepared = prepareRpcInvocationArguments(cancelable, actualArguments);
		// Invocation requires an active owner and a retained connected or recovering Session.
		const cannotInvoke =
			!this.#isOwnerActive() ||
			(this.state.status !== RpcStateStatusEnum.connected &&
				this.state.status !== RpcStateStatusEnum.recovering) ||
			this.#session === undefined;
		if (cannotInvoke) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const args = normalizeRpcApplicationArguments(
			prepared.applicationArguments,
		);
		const reservation = this.reserveOutgoingProtocolInvocation(
			service,
			member,
			args,
		);
		if (reservation === undefined) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}

		const invocation = reservation.commit();
		let removeAbortListener: (() => void) | undefined;
		if (prepared.signal !== undefined) {
			removeAbortListener = installRpcAbortListener(
				prepared.signal,
				invocation.cancel,
			);
		}
		invocation.start();
		return invocation.result.finally(removeAbortListener);
	}

	/** Package-private unary invocation reservation seam. */
	reserveOutgoingProtocolInvocation(
		service: string,
		member: string,
		args: IRpcApplicationArgumentsSnapshot,
	): IRpcPeerInvocationReservation | undefined {
		const session = this.#session;
		// Reservation uses the same active retained-Session gate as invocation.
		const cannotReserveInvocation =
			!this.#isOwnerActive() ||
			(this.state.status !== RpcStateStatusEnum.connected &&
				this.state.status !== RpcStateStatusEnum.recovering) ||
			session === undefined;
		if (cannotReserveInvocation) {
			return undefined;
		}
		const applicationWorkReservation = this.#reserveApplicationWork(
			"local",
			false,
		);
		if (applicationWorkReservation === undefined) {
			return undefined;
		}

		let reservation: ReturnType<IRpcProtocolSession["reserveInvocation"]>;
		try {
			reservation = session.reserveInvocation({ service, member, args });
		} catch (error) {
			applicationWorkReservation.release();
			throw this.#protocolFailure(error);
		}
		if (reservation === undefined) {
			applicationWorkReservation.release();
			return undefined;
		}
		if (!rpcInvocationReservationSchema.safeParse(reservation).success) {
			applicationWorkReservation.release();
			throw this.#protocolFailure(new Error("Invalid invocation reservation."));
		}

		let state: "pending" | "committed" | "released" = "pending";
		return Object.freeze<IRpcPeerInvocationReservation>({
			commit: () => {
				if (state !== "pending") {
					throw this.#protocolFailure(
						new Error("Invocation reservation had multiple winners."),
					);
				}
				state = "committed";
				return this.#commitOutgoingProtocolInvocation(
					reservation,
					applicationWorkReservation,
					service,
					member,
				);
			},
			release: () => {
				if (state !== "pending") {
					throw this.#protocolFailure(
						new Error("Invocation reservation had multiple winners."),
					);
				}
				state = "released";
				try {
					reservation.release();
				} catch (error) {
					throw this.#protocolFailure(error);
				} finally {
					applicationWorkReservation.release();
				}
			},
		});
	}

	#commitOutgoingProtocolInvocation(
		reservation: NonNullable<
			ReturnType<IRpcProtocolSession["reserveInvocation"]>
		>,
		applicationWorkReservation: IRpcApplicationWorkReservation,
		service: string,
		member: string,
	): IRpcPeerCommittedInvocation {
		const result = Promise.withResolvers<unknown>();
		const observationId = createObservationId();
		const startedAt = Date.now();
		let published = false;
		let settled = false;
		let queuedOutcome: RpcCallOutcome | undefined;

		const finish = (outcome: RpcCallOutcome): void => {
			if (!isRpcCallOutcome(outcome)) {
				this.#onProtocolFault(
					new Error("Protocol supplied an invalid invocation outcome."),
				);
				return;
			}
			if (!published) {
				if (queuedOutcome !== undefined) {
					this.#onProtocolFault(
						new Error("Protocol finished an invocation twice."),
					);
					return;
				}
				queuedOutcome = outcome;
				return;
			}
			if (settled) {
				this.#onProtocolFault(
					new Error("Protocol finished an invocation twice."),
				);
				return;
			}
			settled = true;
			applicationWorkReservation.release();
			const durationMs = observationDuration(startedAt);
			// Successful Protocol outcomes are normalized to one caller-visible result path.
			const callReturned =
				outcome.type === RpcCallTerminalTypeEnum.returned ||
				outcome.type === RpcCallTerminalTypeEnum.returnedVoid;
			if (callReturned) {
				this.#emitEvent({
					type: RpcEventTypeEnum.callFinished,
					observationId,
					peer: this,
					direction: RpcEventDirectionEnum.outgoing,
					service,
					member,
					outcome: RpcCallStatusEnum.fulfilled,
					durationMs,
				});
				result.resolve(
					outcome.type === RpcCallTerminalTypeEnum.returned
						? outcome.value.value
						: undefined,
				);
				return;
			}

			this.#emitEvent({
				type: RpcEventTypeEnum.callFinished,
				observationId,
				peer: this,
				direction: RpcEventDirectionEnum.outgoing,
				service,
				member,
				outcome: RpcCallStatusEnum.rejected,
				code: outcome.code,
				durationMs,
			});
			result.reject(createRpcException(outcome.code));
		};

		let protocolInvocation: ReturnType<typeof reservation.commit>;
		try {
			protocolInvocation = reservation.commit({ finish });
		} catch (error) {
			applicationWorkReservation.release();
			throw this.#protocolFailure(error);
		}
		if (!rpcCommittedInvocationSchema.safeParse(protocolInvocation).success) {
			applicationWorkReservation.release();
			throw this.#protocolFailure(new Error("Invalid committed invocation."));
		}

		this.#emitEvent({
			type: RpcEventTypeEnum.callStarted,
			observationId,
			peer: this,
			direction: RpcEventDirectionEnum.outgoing,
			service,
			member,
		});
		published = true;
		if (queuedOutcome !== undefined) {
			finish(queuedOutcome);
		}

		let canceled = false;
		let started = false;
		return Object.freeze<IRpcPeerCommittedInvocation>({
			result: result.promise,
			cancel: () => {
				if (settled || canceled) {
					return;
				}
				canceled = true;
				try {
					protocolInvocation.cancel();
				} catch (error) {
					result.reject(this.#protocolFailure(error));
				}
			},
			start: () => {
				// A committed invocation starts at most once and never after cancellation or settlement.
				const cannotStart = settled || canceled || started;
				if (cannotStart) {
					return;
				}
				started = true;
				try {
					protocolInvocation.start();
				} catch (error) {
					result.reject(this.#protocolFailure(error));
				}
			},
		});
	}

	/** Package-private Framework reservation port for one validated remote call. */
	reserveIncomingProtocolCall(
		request: IRpcProtocolIncomingCallRequest,
	): RpcProtocolIncomingCallReservation | undefined {
		if (!isIncomingCallRequest(request)) {
			this.#onProtocolFault(
				new Error("Protocol supplied an invalid incoming call request."),
			);
			return undefined;
		}
		const charge = request.args.weight + 256;
		// Incoming admission must fit the Peer count and retained-byte budgets.
		const cannotReserveIncomingCall =
			this.state.status !== RpcStateStatusEnum.connected ||
			charge > this.#maximumIncomingBytes - this.#incomingReservationBytes;
		if (cannotReserveIncomingCall) {
			return undefined;
		}
		const applicationWorkReservation = this.#reserveApplicationWork(
			"remote",
			false,
		);
		if (applicationWorkReservation === undefined) {
			return undefined;
		}
		let retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
		try {
			retainedBytesReservation = this.#reserveRetainedBytes(charge);
		} catch (error) {
			applicationWorkReservation.release();
			throw error;
		}
		if (retainedBytesReservation === undefined) {
			applicationWorkReservation.release();
			return undefined;
		}
		this.#incomingReservationBytes += charge;
		const exposure =
			this.#localExposureRegistry.get(request.service) ??
			this.#ownerExposureRegistry.get(request.service);
		if (exposure === undefined) {
			return this.#reserveUnknownIncoming(
				RpcExceptionCodeEnum.unknownService,
				charge,
				retainedBytesReservation,
				applicationWorkReservation,
			);
		}
		const route = exposure.members.get(request.member);
		if (route === undefined || route.kind !== "unary") {
			return this.#reserveUnknownIncoming(
				RpcExceptionCodeEnum.unknownMember,
				charge,
				retainedBytesReservation,
				applicationWorkReservation,
				exposure.wireName,
			);
		}
		return this.#reserveHandlerIncoming(
			request,
			exposure.wireName,
			route,
			charge,
			retainedBytesReservation,
			applicationWorkReservation,
		);
	}

	/** Package-private Framework reservation port for one validated remote stream. */
	reserveIncomingProtocolStream(
		request: RpcProtocolStreamRequest,
	): RpcProtocolIncomingStreamReservation | undefined {
		if (!isIncomingStreamRequest(request)) {
			this.#onProtocolFault(
				new Error("Protocol supplied an invalid incoming stream request."),
			);
			return undefined;
		}
		const charge =
			(request.kind === "stream-method" ? request.args.weight : 0) + 256;
		// Incoming capacity is reserved before any service or member route lookup.
		const cannotReserveIncomingStream =
			this.state.status !== RpcStateStatusEnum.connected ||
			charge > this.#maximumIncomingBytes - this.#incomingReservationBytes;
		if (cannotReserveIncomingStream) {
			return undefined;
		}
		const applicationWorkReservation = this.#reserveApplicationWork(
			"remote",
			true,
		);
		if (applicationWorkReservation === undefined) {
			return undefined;
		}
		let retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
		try {
			retainedBytesReservation = this.#reserveRetainedBytes(charge);
		} catch (error) {
			applicationWorkReservation.release();
			throw error;
		}
		if (retainedBytesReservation === undefined) {
			applicationWorkReservation.release();
			return undefined;
		}
		this.#incomingReservationBytes += charge;
		const exposure =
			this.#localExposureRegistry.get(request.service) ??
			this.#ownerExposureRegistry.get(request.service);
		if (exposure === undefined) {
			return this.#reserveUnknownIncomingStream(
				RpcExceptionCodeEnum.unknownService,
				charge,
				retainedBytesReservation,
				applicationWorkReservation,
			);
		}
		const route = exposure.members.get(request.member);
		if (route === undefined || route.kind !== request.kind) {
			return this.#reserveUnknownIncomingStream(
				RpcExceptionCodeEnum.unknownMember,
				charge,
				retainedBytesReservation,
				applicationWorkReservation,
				exposure.wireName,
			);
		}
		return this.#reserveSourceIncomingStream(
			request,
			route,
			charge,
			retainedBytesReservation,
			applicationWorkReservation,
		);
	}

	#reserveUnknownIncomingStream(
		code:
			| RpcExceptionCodeEnum.unknownService
			| RpcExceptionCodeEnum.unknownMember,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		applicationWorkReservation: IRpcApplicationWorkReservation,
		service?: string,
	): RpcProtocolIncomingStreamReservation {
		let state: "pending" | "committed" | "released" = "pending";
		let finished = false;
		let observationId = "";
		let startedAt = 0;
		const stream = Object.freeze<IRpcProtocolIncomingStream>({
			finish: (outcome, onReleased) => {
				if (finished || state !== "committed") {
					return;
				}
				const outcomeMatchesRoute =
					outcome.type === "failed" && outcome.code === code;
				if (!outcomeMatchesRoute) {
					this.#onProtocolFault(
						new Error("Protocol supplied the wrong unknown-stream terminal."),
					);
					return;
				}
				finished = true;
				const durationMs = observationDuration(startedAt);
				this.#releaseIncomingCapacity(
					charge,
					retainedBytesReservation,
					applicationWorkReservation,
				);
				let releaseError: unknown;
				try {
					onReleased();
				} catch (error) {
					releaseError = error;
				}
				const base = {
					type: RpcEventTypeEnum.streamFinished as const,
					observationId,
					peer: this,
					direction: RpcEventDirectionEnum.incoming as const,
					outcome: RpcStreamStatusEnum.failed as const,
					admittedItemCount: 0 as const,
					durationMs,
				};
				this.#emitEvent(
					code === RpcExceptionCodeEnum.unknownService
						? { ...base, code: RpcExceptionCodeEnum.unknownService }
						: {
								...base,
								service: service as string,
								code: RpcExceptionCodeEnum.unknownMember,
							},
				);
				if (releaseError !== undefined) {
					this.#onProtocolFault(
						releaseError instanceof Error
							? releaseError
							: new Error("Protocol stream release callback failed."),
					);
				}
			},
		});
		return {
			kind: "unknown",
			code,
			reservation: Object.freeze({
				commit: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming stream reservation had multiple winners."),
						);
						return stream;
					}
					state = "committed";
					observationId = createObservationId();
					startedAt = Date.now();
					const base = {
						type: RpcEventTypeEnum.streamStarted as const,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming as const,
					};
					this.#emitEvent(
						code === RpcExceptionCodeEnum.unknownService
							? base
							: { ...base, service: service as string },
					);
					return stream;
				},
				release: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming stream reservation had multiple winners."),
						);
						return;
					}
					state = "released";
					this.#releaseIncomingCapacity(
						charge,
						retainedBytesReservation,
						applicationWorkReservation,
					);
				},
			}),
		};
	}

	#reserveSourceIncomingStream(
		request: RpcProtocolStreamRequest,
		route: RpcStreamRoute,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		applicationWorkReservation: IRpcApplicationWorkReservation,
	): RpcProtocolIncomingStreamReservation {
		let state: "pending" | "committed" | "released" = "pending";
		const service = request.service;
		const member = request.member;
		let capturedRoute: RpcStreamRoute | undefined = route;
		let argumentsSnapshot =
			request.kind === "stream-method" ? request.args : undefined;
		return {
			kind: "source",
			reservation: Object.freeze({
				commit: (source: IRpcProtocolSourceSink) => {
					if (state !== "pending" || capturedRoute === undefined) {
						throw this.#protocolFailure(
							new Error("Incoming stream reservation had multiple winners."),
						);
					}
					state = "committed";
					const observationId = createObservationId();
					const startedAt = Date.now();
					const adapter = createRpcSourceSubscription(
						capturedRoute,
						argumentsSnapshot,
						source,
						(error) => this.#protocolFailure(error),
						() =>
							this.#releaseIncomingCapacity(
								charge,
								retainedBytesReservation,
								applicationWorkReservation,
							),
						(outcome, finishedAt, admittedItemCount, sourceTeardownFailed) => {
							const base = {
								type: RpcEventTypeEnum.streamFinished as const,
								observationId,
								peer: this,
								direction: RpcEventDirectionEnum.incoming as const,
								service,
								member,
								admittedItemCount,
								durationMs: observationDuration(startedAt, finishedAt),
								...(sourceTeardownFailed
									? { sourceTeardownFailed: true as const }
									: {}),
							};
							if (outcome.type === "completed") {
								this.#emitEvent({
									...base,
									outcome: RpcStreamStatusEnum.completed,
								});
								return;
							}
							if (outcome.type === "canceled") {
								this.#emitEvent({
									...base,
									outcome: RpcStreamStatusEnum.canceled,
								});
								return;
							}
							if (outcome.type === "session-terminated") {
								this.#emitEvent({
									...base,
									outcome: RpcStreamStatusEnum.terminated,
								});
								return;
							}
							// A known Source exposes only application failure and overflow codes.
							const sourceFailureIsPublic =
								outcome.code === RpcExceptionCodeEnum.handlerFailed ||
								outcome.code === RpcExceptionCodeEnum.overflow;
							if (!sourceFailureIsPublic) {
								this.#emitEvent({
									...base,
									outcome: RpcStreamStatusEnum.terminated,
								});
								this.#protocolFailure(
									new Error(
										"Protocol supplied an invalid known-stream terminal.",
									),
								);
								return;
							}
							this.#emitEvent({
								...base,
								outcome: RpcStreamStatusEnum.failed,
								code: outcome.code,
							});
						},
					);
					this.#emitEvent({
						type: RpcEventTypeEnum.streamStarted,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming,
						service,
						member,
					});
					capturedRoute = undefined;
					argumentsSnapshot = undefined;
					const removeQueuedJob = this.#handlerScheduler.enqueue(
						this,
						(releasePermit) => adapter.start(releasePermit),
					);
					adapter.setQueuedJobRemoval(removeQueuedJob);
					return adapter;
				},
				release: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming stream reservation had multiple winners."),
						);
						return;
					}
					state = "released";
					capturedRoute = undefined;
					argumentsSnapshot = undefined;
					this.#releaseIncomingCapacity(
						charge,
						retainedBytesReservation,
						applicationWorkReservation,
					);
				},
			}),
		};
	}

	#releaseIncomingCapacity(
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		applicationWorkReservation: IRpcApplicationWorkReservation,
	): void {
		retainedBytesReservation.release();
		applicationWorkReservation.release();
		this.#incomingReservationBytes = Math.max(
			0,
			this.#incomingReservationBytes - charge,
		);
	}

	#reserveUnknownIncoming(
		code: RpcUnknownCallFailure,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		applicationWorkReservation: IRpcApplicationWorkReservation,
		service?: string,
	): RpcProtocolIncomingCallReservation {
		let state: "pending" | "committed" | "released" = "pending";
		let settled = false;
		let observationId = "";
		let startedAt = 0;
		const call = Object.freeze<IRpcProtocolIncomingCall>({
			finish: (outcome) => {
				if (settled || state !== "committed") {
					this.#onProtocolFault(new Error("Invalid unknown-call terminal."));
					return;
				}
				if (!isExpectedUnknownTerminal(outcome, code)) {
					this.#onProtocolFault(
						new Error("Protocol supplied the wrong unknown-call terminal."),
					);
					return;
				}
				settled = true;
				this.#releaseIncomingCapacity(
					charge,
					retainedBytesReservation,
					applicationWorkReservation,
				);
				const durationMs = observationDuration(startedAt);
				if (code === RpcExceptionCodeEnum.unknownService) {
					this.#emitEvent({
						type: RpcEventTypeEnum.callFinished,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming as const,
						outcome: RpcCallStatusEnum.rejected,
						code: RpcExceptionCodeEnum.unknownService,
						durationMs,
					});
				} else {
					this.#emitEvent({
						type: RpcEventTypeEnum.callFinished,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming,
						service: service as string,
						outcome: RpcCallStatusEnum.rejected,
						code: RpcExceptionCodeEnum.unknownMember,
						durationMs,
					});
				}
			},
		});

		return {
			kind: RpcIncomingCallKindEnum.unknown,
			code,
			reservation: Object.freeze({
				commit: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming reservation was committed more than once."),
						);
						return call;
					}
					state = "committed";
					observationId = createObservationId();
					startedAt = Date.now();
					const base = {
						type: RpcEventTypeEnum.callStarted as const,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming as const,
					};
					this.#emitEvent(
						code === RpcExceptionCodeEnum.unknownService
							? base
							: { ...base, service: service as string },
					);
					return call;
				},
				release: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming reservation had multiple winners."),
						);
						return;
					}
					state = "released";
					this.#releaseIncomingCapacity(
						charge,
						retainedBytesReservation,
						applicationWorkReservation,
					);
				},
			}),
		};
	}

	#reserveHandlerIncoming(
		{ args, member }: IRpcProtocolIncomingCallRequest,
		service: string,
		route: RpcHandlerRoute,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		applicationWorkReservation: IRpcApplicationWorkReservation,
	): RpcProtocolIncomingCallReservation {
		let state: "pending" | "committed" | "released" = "pending";
		let settled = false;
		let handlerStarted = false;
		let observationId = "";
		let startedAt = 0;
		let argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined = args;
		let removeQueuedJob: (() => void) | undefined;
		const abortController = new AbortController();
		const handlerOutcome = Promise.withResolvers<RpcHandlerOutcome>();

		const call = Object.freeze<IRpcProtocolIncomingHandlerCall>({
			handlerOutcome: handlerOutcome.promise,
			finish: (outcome: RpcIncomingTerminal) => {
				if (settled || state !== "committed") {
					this.#onProtocolFault(new Error("Incoming call finished twice."));
					return;
				}
				if (!isHandlerTerminal(outcome)) {
					this.#onProtocolFault(
						new Error("Protocol supplied an invalid handler terminal."),
					);
					return;
				}
				settled = true;
				argumentsSnapshot = undefined;
				removeQueuedJob?.();
				removeQueuedJob = undefined;
				this.#releaseIncomingCapacity(
					charge,
					retainedBytesReservation,
					applicationWorkReservation,
				);
				// Session termination and acknowledged cancellation both settle as cancellation.
				const callWasCanceled =
					outcome.type === RpcCallTerminalTypeEnum.sessionTerminated ||
					(outcome.type === RpcCallTerminalTypeEnum.failed &&
						outcome.code === RpcExceptionCodeEnum.canceled);
				if (callWasCanceled) {
					abortController.abort();
				}
				if (!handlerStarted) {
					handlerOutcome.resolve({
						type: RpcCallTerminalTypeEnum.notStarted,
					});
				}
				const base = {
					type: RpcEventTypeEnum.callFinished as const,
					observationId,
					peer: this,
					direction: RpcEventDirectionEnum.incoming as const,
					service,
					member,
					durationMs: observationDuration(startedAt),
				};
				// Successful handler outcomes commit returned payload or void.
				const handlerReturned =
					outcome.type === RpcCallTerminalTypeEnum.returned ||
					outcome.type === RpcCallTerminalTypeEnum.returnedVoid;
				if (outcome.type === RpcCallTerminalTypeEnum.sessionTerminated) {
					this.#emitEvent({ ...base, outcome: RpcCallStatusEnum.terminated });
				} else if (handlerReturned) {
					this.#emitEvent({ ...base, outcome: RpcCallStatusEnum.fulfilled });
				} else {
					this.#emitEvent({
						...base,
						outcome: RpcCallStatusEnum.rejected,
						code: outcome.code,
					});
				}
			},
		});

		const observeHandlerResult = (
			result: unknown,
			releasePermit: () => void,
		): void => {
			void Promise.resolve(result).then(
				(value) => {
					if (settled) {
						handlerOutcome.resolve({
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						});
						releasePermit();
						return;
					}
					try {
						if (value === undefined) {
							handlerOutcome.resolve({
								type: RpcCallTerminalTypeEnum.returnedVoid,
							});
						} else {
							const snapshot = normalizeRpcApplicationValue(value);
							if (settled) {
								handlerOutcome.resolve({
									type: RpcCallTerminalTypeEnum.failed,
									code: RpcExceptionCodeEnum.handlerFailed,
								});
								return;
							}
							handlerOutcome.resolve({
								type: RpcCallTerminalTypeEnum.returned,
								value: snapshot,
							});
						}
					} catch {
						handlerOutcome.resolve({
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						});
					} finally {
						releasePermit();
					}
				},
				() => {
					handlerOutcome.resolve({
						type: RpcCallTerminalTypeEnum.failed,
						code: RpcExceptionCodeEnum.handlerFailed,
					});
					releasePermit();
				},
			);
		};

		const runHandler = (releasePermit: () => void): boolean => {
			removeQueuedJob = undefined;
			if (settled) {
				handlerOutcome.resolve({ type: RpcCallTerminalTypeEnum.notStarted });
				return false;
			}
			handlerStarted = true;
			const retainedArguments = argumentsSnapshot;
			argumentsSnapshot = undefined;
			if (retainedArguments === undefined) {
				handlerOutcome.resolve({
					type: RpcCallTerminalTypeEnum.notStarted,
				});
				return false;
			}
			let result: unknown;
			try {
				result = invokeRpcHandler(
					route,
					retainedArguments,
					abortController.signal,
				);
			} catch {
				handlerOutcome.resolve({
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.handlerFailed,
				});
				releasePermit();
				return true;
			}
			observeHandlerResult(result, releasePermit);
			return true;
		};

		return {
			kind: RpcIncomingCallKindEnum.handler,
			reservation: Object.freeze({
				commit: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming reservation was committed more than once."),
						);
						return call;
					}
					state = "committed";
					observationId = createObservationId();
					startedAt = Date.now();
					this.#emitEvent({
						type: RpcEventTypeEnum.callStarted,
						observationId,
						peer: this,
						direction: RpcEventDirectionEnum.incoming,
						service,
						member,
					});
					removeQueuedJob = this.#handlerScheduler.enqueue(this, runHandler);
					return call;
				},
				release: () => {
					if (state !== "pending") {
						this.#onProtocolFault(
							new Error("Incoming reservation had multiple winners."),
						);
						return;
					}
					state = "released";
					argumentsSnapshot = undefined;
					this.#releaseIncomingCapacity(
						charge,
						retainedBytesReservation,
						applicationWorkReservation,
					);
				},
			}),
		};
	}

	#protocolFailure(error: unknown): Error {
		const cause =
			error instanceof Error ? error : new Error("Protocol invocation failed.");
		this.#onProtocolFault(cause);
		return createRpcException(RpcExceptionCodeEnum.protocol, cause);
	}

	/** Package-private Session attachment retained across bindings. */
	attachProtocolSession(session: IRpcProtocolSession): boolean {
		if (this.#session !== undefined) {
			return false;
		}
		this.#session = session;
		return true;
	}

	/** Package-private peer-local registry used for Acceptor union validation. */
	get localExposureRegistry(): RpcExposureRegistry {
		return this.#localExposureRegistry;
	}
}
