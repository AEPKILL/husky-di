/**
 * @overview Stable caller-facing RPC Peer implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { Observable, Subject } from "rxjs";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcCallDirectionEnum } from "@/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolIncomingCallReservation,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
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
} from "@/types/rpc-exposure.type";
import type { CreateRpcPeerOptions } from "@/types/rpc-peer.type";
import {
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

function observationDuration(startedAt: number): number {
	return Math.min(
		Number.MAX_SAFE_INTEGER,
		Math.max(0, Math.floor(Date.now() - startedAt)),
	);
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

/** Retains one stable Peer identity and its replay-latest state snapshot. */
export class RpcPeerImpl implements IRpcPeerRuntime {
	readonly #stateSubject = new Subject<RpcPeerState>();
	readonly #localExposureRegistry: RpcExposureRegistry = new Map();
	readonly #ownerExposureRegistry: RpcExposureRegistry;
	readonly #isOwnerActive: () => boolean;
	readonly #emitEvent: (event: RpcEvent) => void;
	readonly #onProtocolFault: (error: Error) => void;
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #maximumIncomingBytes: number;
	readonly #reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	#state: RpcPeerState;
	#stateDirty = false;
	#session: IRpcProtocolSession | undefined;
	#incomingReservationCount = 0;
	#incomingReservationBytes = 0;
	readonly state$: Observable<RpcPeerState>;

	constructor(options: CreateRpcPeerOptions) {
		const {
			emitEvent,
			handlerScheduler,
			initialState,
			isOwnerActive,
			maximumIncomingBytes,
			onProtocolFault,
			ownerExposureRegistry,
			reserveRetainedBytes,
		} = options;
		this.#state = Object.freeze(initialState);
		this.#ownerExposureRegistry = ownerExposureRegistry;
		this.#isOwnerActive = isOwnerActive;
		this.#emitEvent = emitEvent;
		this.#onProtocolFault = onProtocolFault;
		this.#handlerScheduler = handlerScheduler;
		this.#maximumIncomingBytes = maximumIncomingBytes;
		this.#reserveRetainedBytes = reserveRetainedBytes;
		this.state$ = new Observable((subscriber) => {
			const subscription = this.#stateSubject.subscribe(subscriber);
			if (!subscriber.closed) {
				subscriber.next(this.#state);
			}
			return subscription;
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
	}

	/** Package-private notification flush for a previously staged state. */
	flushState(): void {
		if (!this.#stateDirty) {
			return;
		}
		this.#stateDirty = false;
		this.#stateSubject.next(this.#state);
	}

	/** Package-private terminal cleanup after the final snapshot is committed. */
	completeState(): void {
		this.flushState();
		this.#localExposureRegistry.clear();
		this.#session = undefined;
		this.#stateSubject.complete();
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
		return createRpcFacade(descriptor, (method, cancelable, actualArguments) =>
			this.#invoke(service, method, cancelable, actualArguments),
		);
	}

	#invoke(
		service: string,
		method: string,
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
			method,
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

	/** Package-private all-or-none group reservation seam. */
	reserveOutgoingProtocolInvocation(
		service: string,
		method: string,
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

		let reservation: ReturnType<IRpcProtocolSession["reserveInvocation"]>;
		try {
			reservation = session.reserveInvocation({ service, method, args });
		} catch (error) {
			throw this.#protocolFailure(error);
		}
		if (reservation === undefined) {
			return undefined;
		}
		if (!rpcInvocationReservationSchema.safeParse(reservation).success) {
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
					service,
					method,
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
				}
			},
		});
	}

	#commitOutgoingProtocolInvocation(
		reservation: NonNullable<
			ReturnType<IRpcProtocolSession["reserveInvocation"]>
		>,
		service: string,
		method: string,
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
					direction: RpcCallDirectionEnum.outgoing,
					service,
					method,
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
				direction: RpcCallDirectionEnum.outgoing,
				service,
				method,
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
			throw this.#protocolFailure(error);
		}
		if (!rpcCommittedInvocationSchema.safeParse(protocolInvocation).success) {
			throw this.#protocolFailure(new Error("Invalid committed invocation."));
		}

		this.#emitEvent({
			type: RpcEventTypeEnum.callStarted,
			observationId,
			peer: this,
			direction: RpcCallDirectionEnum.outgoing,
			service,
			method,
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
			this.#incomingReservationCount >= 256 ||
			charge > this.#maximumIncomingBytes - this.#incomingReservationBytes;
		if (cannotReserveIncomingCall) {
			return undefined;
		}
		const retainedBytesReservation = this.#reserveRetainedBytes(charge);
		if (retainedBytesReservation === undefined) {
			return undefined;
		}
		this.#incomingReservationCount += 1;
		this.#incomingReservationBytes += charge;
		const exposure =
			this.#localExposureRegistry.get(request.service) ??
			this.#ownerExposureRegistry.get(request.service);
		if (exposure === undefined) {
			return this.#reserveUnknownIncoming(
				RpcExceptionCodeEnum.unknownService,
				charge,
				retainedBytesReservation,
			);
		}
		const route = exposure.members.get(request.method);
		if (route === undefined || route.kind !== "unary") {
			return this.#reserveUnknownIncoming(
				RpcExceptionCodeEnum.unknownMethod,
				charge,
				retainedBytesReservation,
				exposure.wireName,
			);
		}
		return this.#reserveHandlerIncoming(
			request,
			exposure.wireName,
			route,
			charge,
			retainedBytesReservation,
		);
	}

	#releaseIncomingCapacity(
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
	): void {
		retainedBytesReservation.release();
		this.#incomingReservationCount = Math.max(
			0,
			this.#incomingReservationCount - 1,
		);
		this.#incomingReservationBytes = Math.max(
			0,
			this.#incomingReservationBytes - charge,
		);
	}

	#reserveUnknownIncoming(
		code: RpcUnknownCallFailure,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
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
				this.#releaseIncomingCapacity(charge, retainedBytesReservation);
				const durationMs = observationDuration(startedAt);
				if (code === RpcExceptionCodeEnum.unknownService) {
					this.#emitEvent({
						type: RpcEventTypeEnum.callFinished,
						observationId,
						peer: this,
						direction: RpcCallDirectionEnum.incoming as const,
						outcome: RpcCallStatusEnum.rejected,
						code: RpcExceptionCodeEnum.unknownService,
						durationMs,
					});
				} else {
					this.#emitEvent({
						type: RpcEventTypeEnum.callFinished,
						observationId,
						peer: this,
						direction: RpcCallDirectionEnum.incoming,
						service: service as string,
						outcome: RpcCallStatusEnum.rejected,
						code: RpcExceptionCodeEnum.unknownMethod,
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
						direction: RpcCallDirectionEnum.incoming as const,
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
					this.#releaseIncomingCapacity(charge, retainedBytesReservation);
				},
			}),
		};
	}

	#reserveHandlerIncoming(
		{ args, method }: IRpcProtocolIncomingCallRequest,
		service: string,
		route: RpcHandlerRoute,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
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
				this.#releaseIncomingCapacity(charge, retainedBytesReservation);
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
					direction: RpcCallDirectionEnum.incoming as const,
					service,
					method,
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
						direction: RpcCallDirectionEnum.incoming,
						service,
						method,
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
					this.#releaseIncomingCapacity(charge, retainedBytesReservation);
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
