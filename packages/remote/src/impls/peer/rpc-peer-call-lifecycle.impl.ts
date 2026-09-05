/**
 * @overview Owns Framework invocation, incoming reservation, handler settlement and call observations.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { z } from "zod";
import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/enums/protocol/rpc-incoming-call-kind.enum";
import { RpcCallDirectionEnum } from "@/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "@/enums/rpc-call-status.enum";
import { RpcEventTypeEnum } from "@/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/enums/rpc-state-status.enum";
import { createRpcException } from "@/factories/rpc-exception.factory";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/interfaces/peer/rpc-peer.interface";
import type {
	IRpcPeerCallLifecycle,
	RpcPeerCallLifecycleFactory,
} from "@/interfaces/peer/rpc-peer-call-lifecycle.interface";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolIncomingCallReservation,
	RpcUnknownCallFailure,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcExposure,
	RpcHandlerRoute,
} from "@/types/common/rpc-exposure.type";
import type { RpcCallEventSink } from "@/types/peer/rpc-peer-call-event.type";
import {
	isRpcApplicationArgumentsSnapshot,
	isRpcApplicationSnapshot,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
} from "@/utils/rpc-application-value.util";
import {
	installRpcAbortListener,
	prepareRpcInvocationArguments,
} from "@/utils/rpc-cancellation.util";
import { isCallable, isNonNullObject } from "@/utils/type-guard.util";

export type CreateRpcPeerCallLifecycleOptions =
	Parameters<RpcPeerCallLifecycleFactory>[0];

/** Owns complete unary call lifetimes behind the two asymmetric admission operations. */
export class RpcPeerCallLifecycleImpl implements IRpcPeerCallLifecycle {
	readonly #peer: IRpcPeer;
	readonly #getSession: () => IRpcProtocolSession | undefined;
	readonly #findExposure: (wireName: string) => RpcExposure | undefined;
	readonly #isOwnerActive: () => boolean;
	readonly #callEventSink: RpcCallEventSink;
	readonly #onProtocolFault: (error: Error) => void;
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #maximumIncomingBytes: number;
	readonly #reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	#incomingReservationCount = 0;
	#incomingReservationBytes = 0;

	constructor(options: CreateRpcPeerCallLifecycleOptions) {
		this.#peer = options.peer;
		this.#getSession = options.getSession;
		this.#findExposure = options.findExposure;
		this.#isOwnerActive = options.isOwnerActive;
		this.#callEventSink = options.callEventSink;
		this.#onProtocolFault = options.onProtocolFault;
		this.#handlerScheduler = options.handlerScheduler;
		this.#maximumIncomingBytes = options.maximumIncomingBytes;
		this.#reserveRetainedBytes = options.reserveRetainedBytes;
	}

	invoke(
		service: string,
		method: string,
		cancelable: boolean,
		actualArguments: readonly unknown[],
	): Promise<unknown> {
		const prepared = prepareRpcInvocationArguments(cancelable, actualArguments);
		// Invocation requires an active owner and a retained connected or recovering Session.
		const cannotInvoke =
			!this.#isOwnerActive() ||
			(this.#peer.state.status !== RpcStateStatusEnum.connected &&
				this.#peer.state.status !== RpcStateStatusEnum.recovering) ||
			this.#getSession() === undefined;
		if (cannotInvoke) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}
		const args = normalizeRpcApplicationArguments(
			prepared.applicationArguments,
		);
		const invocation = this.#prepareInvocation(service, method, args);
		if (invocation === undefined) {
			return Promise.reject(
				createRpcException(RpcExceptionCodeEnum.unavailable),
			);
		}

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

	#prepareInvocation(
		service: string,
		method: string,
		args: IRpcApplicationArgumentsSnapshot,
	): IRpcPeerCommittedInvocation | undefined {
		const session = this.#getSession();
		// Preparation uses the same active retained-Session gate as invocation.
		const cannotPrepareInvocation =
			!this.#isOwnerActive() ||
			(this.#peer.state.status !== RpcStateStatusEnum.connected &&
				this.#peer.state.status !== RpcStateStatusEnum.recovering) ||
			session === undefined;
		if (cannotPrepareInvocation) {
			return undefined;
		}

		const result = Promise.withResolvers<unknown>();
		const observationId = createObservationId();
		const startedAt = Date.now();
		let phase:
			| "preparing"
			| "publishing"
			| "published"
			| "unavailable"
			| "failed" = "preparing";
		let settled = false;
		let faulting = false;
		let preparationError: Error | undefined;
		let queuedOutcome: RpcCallOutcome | undefined;
		const failPublishedInvocation = (error: unknown): Error => {
			if (faulting) {
				return createRpcException(RpcExceptionCodeEnum.protocol);
			}
			faulting = true;
			try {
				return this.#protocolFailure(error);
			} finally {
				faulting = false;
				phase = "failed";
			}
		};

		const finish = (outcome: RpcCallOutcome): void => {
			if (phase === "unavailable") {
				phase = "failed";
				this.#onProtocolFault(
					new Error("Protocol finished an unavailable invocation."),
				);
				return;
			}
			if (phase === "failed") {
				return;
			}
			if (!isRpcCallOutcome(outcome)) {
				const error = new Error(
					"Protocol supplied an invalid invocation outcome.",
				);
				if (phase === "preparing" || phase === "publishing") {
					preparationError ??= error;
					return;
				}
				failPublishedInvocation(error);
				return;
			}
			if (phase === "preparing" || phase === "publishing") {
				if (queuedOutcome !== undefined || preparationError !== undefined) {
					preparationError ??= new Error(
						"Protocol finished an invocation more than once during preparation.",
					);
					return;
				}
				queuedOutcome = outcome;
				return;
			}
			if (settled) {
				if (!faulting) {
					failPublishedInvocation(
						new Error("Protocol finished an invocation twice."),
					);
				}
				return;
			}
			settled = true;
			const durationMs = observationDuration(startedAt);
			// Successful Protocol outcomes are normalized to one caller-visible result path.
			const callReturned =
				outcome.type === RpcCallTerminalTypeEnum.returned ||
				outcome.type === RpcCallTerminalTypeEnum.returnedVoid;
			if (callReturned) {
				this.#callEventSink({
					type: RpcEventTypeEnum.callFinished,
					observationId,
					peer: this.#peer,
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

			this.#callEventSink({
				type: RpcEventTypeEnum.callFinished,
				observationId,
				peer: this.#peer,
				direction: RpcCallDirectionEnum.outgoing,
				service,
				method,
				outcome: RpcCallStatusEnum.rejected,
				code: outcome.code,
				durationMs,
			});
			result.reject(createRpcException(outcome.code));
		};

		let protocolInvocation: ReturnType<
			IRpcProtocolSession["prepareInvocation"]
		>;
		try {
			protocolInvocation = session.prepareInvocation(
				{ service, method, args },
				finish,
			);
		} catch (error) {
			phase = "failed";
			throw this.#protocolFailure(error);
		}
		if (preparationError !== undefined) {
			phase = "failed";
			throw this.#protocolFailure(preparationError);
		}
		if (protocolInvocation === undefined) {
			if (queuedOutcome !== undefined) {
				phase = "failed";
				throw this.#protocolFailure(
					new Error("Protocol finished an unavailable invocation."),
				);
			}
			phase = "unavailable";
			return undefined;
		}
		let invocationIsValid = false;
		try {
			invocationIsValid =
				rpcCommittedInvocationSchema.safeParse(protocolInvocation).success;
		} catch (error) {
			phase = "failed";
			throw this.#protocolFailure(error);
		}
		if (!invocationIsValid) {
			phase = "failed";
			throw this.#protocolFailure(new Error("Invalid prepared invocation."));
		}
		if (preparationError !== undefined) {
			phase = "failed";
			throw this.#protocolFailure(preparationError);
		}

		phase = "publishing";
		this.#callEventSink({
			type: RpcEventTypeEnum.callStarted,
			observationId,
			peer: this.#peer,
			direction: RpcCallDirectionEnum.outgoing,
			service,
			method,
		});
		phase = "published";
		if (queuedOutcome !== undefined) {
			finish(queuedOutcome);
		}
		if (preparationError !== undefined) {
			void result.promise.catch(() => undefined);
			throw failPublishedInvocation(preparationError);
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

	/** Lends one synchronous incoming-call reservation to the bound Protocol Session. */
	reserveIncomingCall(
		request: IRpcProtocolCallRequest,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): boolean {
		if (!isIncomingCallRequest(request)) {
			const error = new Error(
				"Protocol supplied an invalid incoming call request.",
			);
			this.#onProtocolFault(error);
			throw error;
		}
		const charge = request.args.weight + 256;
		// Incoming admission must fit the Peer count and retained-byte budgets.
		const cannotReserveIncomingCall =
			this.#peer.state.status !== RpcStateStatusEnum.connected ||
			this.#incomingReservationCount >= 256 ||
			charge > this.#maximumIncomingBytes - this.#incomingReservationBytes;
		if (cannotReserveIncomingCall) {
			return false;
		}
		const retainedBytesReservation = this.#reserveRetainedBytes(charge);
		if (retainedBytesReservation === undefined) {
			return false;
		}
		this.#incomingReservationCount += 1;
		this.#incomingReservationBytes += charge;
		const exposure = this.#findExposure(request.service);
		let prepared: RpcPreparedIncomingCall;
		if (exposure === undefined) {
			prepared = this.#prepareUnknownIncoming(
				RpcExceptionCodeEnum.unknownService,
				charge,
				retainedBytesReservation,
			);
		} else {
			const route = exposure.methods.get(request.method);
			prepared =
				route === undefined
					? this.#prepareUnknownIncoming(
							RpcExceptionCodeEnum.unknownMethod,
							charge,
							retainedBytesReservation,
							exposure.wireName,
						)
					: this.#prepareHandlerIncoming(
							request,
							exposure.wireName,
							route,
							charge,
							retainedBytesReservation,
						);
		}
		return this.#consumeIncomingReservation(prepared, consume);
	}

	#consumeIncomingReservation(
		prepared: RpcPreparedIncomingCall,
		consume: (reservation: RpcProtocolIncomingCallReservation) => undefined,
	): true {
		let state: "pending" | "committed" | "released" = "pending";
		let insideScope = true;
		let stickyError: Error | undefined;
		const rejectCommit = (message: string): never => {
			const error = stickyError ?? new Error(message);
			stickyError = error;
			throw error;
		};
		const commitPrepared = <TCall extends IRpcProtocolIncomingCall>(
			commit: () => TCall,
		): TCall => {
			if (!insideScope) {
				const error = new Error(
					"Incoming reservation commit escaped its synchronous scope.",
				);
				prepared.terminate();
				this.#onProtocolFault(error);
				throw error;
			}
			if (state !== "pending") {
				return rejectCommit(
					"Incoming reservation was committed more than once.",
				);
			}
			state = "committed";
			return commit();
		};
		const reservation: RpcProtocolIncomingCallReservation =
			prepared.kind === RpcIncomingCallKindEnum.handler
				? Object.freeze({
						kind: prepared.kind,
						commit: () => commitPrepared(prepared.commit),
					})
				: Object.freeze({
						kind: prepared.kind,
						code: prepared.code,
						commit: () => commitPrepared(prepared.commit),
					});
		let consumedValue: unknown;
		let consumedError: unknown;
		let consumerThrew = false;
		try {
			consumedValue = consume(reservation);
		} catch (error) {
			consumerThrew = true;
			consumedError = error;
		}
		insideScope = false;

		let contractError = stickyError;
		if (contractError === undefined && consumedValue !== undefined) {
			contractError = new Error(
				"Incoming reservation consumer must return undefined synchronously.",
			);
		}
		if (
			contractError === undefined &&
			consumedError === undefined &&
			state === "pending"
		) {
			contractError = new Error(
				"Incoming reservation consumer returned without committing.",
			);
		}
		if (!consumerThrew && contractError === undefined) {
			return true;
		}
		if (state === "pending") {
			state = "released";
			prepared.release();
		} else {
			prepared.terminate();
		}
		const failure = consumerThrew ? consumedError : contractError;
		const cause =
			failure instanceof Error
				? failure
				: new Error("Incoming reservation consumer failed.");
		this.#onProtocolFault(cause);
		throw failure;
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

	#prepareUnknownIncoming(
		code: RpcUnknownCallFailure,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
		service?: string,
	): RpcPreparedUnknownIncomingCall {
		let committed = false;
		let settled = false;
		let observationId = "";
		let startedAt = 0;
		const settle = (
			outcome: RpcIncomingTerminal,
			reportInvalid: boolean,
		): void => {
			if (settled || !committed) {
				if (reportInvalid) {
					this.#onProtocolFault(new Error("Invalid unknown-call terminal."));
				}
				return;
			}
			if (!isExpectedUnknownTerminal(outcome, code)) {
				if (reportInvalid) {
					this.#onProtocolFault(
						new Error("Protocol supplied the wrong unknown-call terminal."),
					);
				}
				return;
			}
			settled = true;
			this.#releaseIncomingCapacity(charge, retainedBytesReservation);
			const durationMs = observationDuration(startedAt);
			if (code === RpcExceptionCodeEnum.unknownService) {
				this.#callEventSink({
					type: RpcEventTypeEnum.callFinished,
					observationId,
					peer: this.#peer,
					direction: RpcCallDirectionEnum.incoming as const,
					outcome: RpcCallStatusEnum.rejected,
					code: RpcExceptionCodeEnum.unknownService,
					durationMs,
				});
			} else {
				this.#callEventSink({
					type: RpcEventTypeEnum.callFinished,
					observationId,
					peer: this.#peer,
					direction: RpcCallDirectionEnum.incoming,
					service: service as string,
					outcome: RpcCallStatusEnum.rejected,
					code: RpcExceptionCodeEnum.unknownMethod,
					durationMs,
				});
			}
		};
		const call = Object.freeze<IRpcProtocolIncomingCall>({
			finish: (outcome) => settle(outcome, true),
		});

		return Object.freeze({
			kind: RpcIncomingCallKindEnum.unknown,
			code,
			commit: () => {
				committed = true;
				observationId = createObservationId();
				startedAt = Date.now();
				const base = {
					type: RpcEventTypeEnum.callStarted as const,
					observationId,
					peer: this.#peer,
					direction: RpcCallDirectionEnum.incoming as const,
				};
				this.#callEventSink(
					code === RpcExceptionCodeEnum.unknownService
						? base
						: { ...base, service: service as string },
				);
				return call;
			},
			release: () => {
				if (settled) {
					return;
				}
				settled = true;
				this.#releaseIncomingCapacity(charge, retainedBytesReservation);
			},
			terminate: () =>
				settle({ type: RpcCallTerminalTypeEnum.failed, code }, false),
		});
	}

	#prepareHandlerIncoming(
		{ args, method }: IRpcProtocolCallRequest,
		service: string,
		route: RpcHandlerRoute,
		charge: number,
		retainedBytesReservation: IRpcRetainedBytesReservation,
	): RpcPreparedHandlerIncomingCall {
		let committed = false;
		let settled = false;
		let handlerStarted = false;
		let observationId = "";
		let startedAt = 0;
		let argumentsSnapshot: IRpcApplicationArgumentsSnapshot | undefined = args;
		let removeQueuedJob: (() => void) | undefined;
		const abortController = new AbortController();
		const handlerOutcome = Promise.withResolvers<RpcHandlerOutcome>();

		const settle = (
			outcome: RpcIncomingTerminal,
			reportInvalid: boolean,
		): void => {
			if (settled || !committed) {
				if (reportInvalid) {
					this.#onProtocolFault(new Error("Incoming call finished twice."));
				}
				return;
			}
			if (!isHandlerTerminal(outcome)) {
				if (reportInvalid) {
					this.#onProtocolFault(
						new Error("Protocol supplied an invalid handler terminal."),
					);
				}
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
				peer: this.#peer,
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
				this.#callEventSink({
					...base,
					outcome: RpcCallStatusEnum.terminated as const,
				});
			} else if (handlerReturned) {
				this.#callEventSink({
					...base,
					outcome: RpcCallStatusEnum.fulfilled as const,
				});
			} else {
				this.#callEventSink({
					...base,
					outcome: RpcCallStatusEnum.rejected as const,
					code: outcome.code,
				});
			}
		};
		const call = Object.freeze<IRpcProtocolIncomingHandlerCall>({
			handlerOutcome: handlerOutcome.promise,
			finish: (outcome: RpcIncomingTerminal) => settle(outcome, true),
		});

		const processHandlerResult = (result: unknown): Promise<void> => {
			const assimilation = new Promise<unknown>((resolve) => resolve(result));
			return assimilation.then(
				(value) => {
					if (settled) {
						handlerOutcome.resolve({
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						});
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
					}
				},
				() => {
					handlerOutcome.resolve({
						type: RpcCallTerminalTypeEnum.failed,
						code: RpcExceptionCodeEnum.handlerFailed,
					});
				},
			);
		};

		const runHandler = (): Promise<void> => {
			removeQueuedJob = undefined;
			if (settled) {
				handlerOutcome.resolve({ type: RpcCallTerminalTypeEnum.notStarted });
				return Promise.resolve();
			}
			handlerStarted = true;
			const retainedArguments = argumentsSnapshot;
			argumentsSnapshot = undefined;
			if (retainedArguments === undefined) {
				handlerOutcome.resolve({
					type: RpcCallTerminalTypeEnum.notStarted,
				});
				return Promise.resolve();
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
				return Promise.resolve();
			}
			return processHandlerResult(result);
		};

		return Object.freeze({
			kind: RpcIncomingCallKindEnum.handler,
			commit: () => {
				committed = true;
				observationId = createObservationId();
				startedAt = Date.now();
				this.#callEventSink({
					type: RpcEventTypeEnum.callStarted,
					observationId,
					peer: this.#peer,
					direction: RpcCallDirectionEnum.incoming,
					service,
					method,
				});
				removeQueuedJob = this.#handlerScheduler.enqueue(
					this.#peer,
					runHandler,
				);
				return call;
			},
			release: () => {
				if (settled) {
					return;
				}
				settled = true;
				argumentsSnapshot = undefined;
				this.#releaseIncomingCapacity(charge, retainedBytesReservation);
			},
			terminate: () =>
				settle({ type: RpcCallTerminalTypeEnum.sessionTerminated }, false),
		});
	}

	#protocolFailure(error: unknown): Error {
		const cause =
			error instanceof Error ? error : new Error("Protocol invocation failed.");
		this.#onProtocolFault(cause);
		return createRpcException(RpcExceptionCodeEnum.protocol, cause);
	}
}

interface IRpcPeerCommittedInvocation {
	readonly result: Promise<unknown>;
	start(): void;
	cancel(): void;
}

interface IProtocolFieldsSnapshot {
	readonly fieldNames: readonly string[];
	readonly fields: Readonly<Record<string, unknown>>;
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

interface IRpcPreparedIncomingCall {
	release(): void;
	terminate(): void;
}

interface RpcPreparedHandlerIncomingCall extends IRpcPreparedIncomingCall {
	readonly kind: RpcIncomingCallKindEnum.handler;
	commit(): IRpcProtocolIncomingHandlerCall;
}

interface RpcPreparedUnknownIncomingCall extends IRpcPreparedIncomingCall {
	readonly kind: RpcIncomingCallKindEnum.unknown;
	readonly code: RpcUnknownCallFailure;
	commit(): IRpcProtocolIncomingCall;
}

type RpcPreparedIncomingCall =
	| RpcPreparedHandlerIncomingCall
	| RpcPreparedUnknownIncomingCall;

const rpcApplicationSnapshotSchema = z.custom<IRpcApplicationSnapshot>(
	isRpcApplicationSnapshot,
);
const rpcApplicationArgumentsSnapshotSchema =
	z.custom<IRpcApplicationArgumentsSnapshot>(isRpcApplicationArgumentsSnapshot);
const rpcOutgoingFailureCodeSchema = z.enum([
	RpcExceptionCodeEnum.canceled,
	RpcExceptionCodeEnum.unavailable,
	RpcExceptionCodeEnum.outcomeUnknown,
	RpcExceptionCodeEnum.handlerFailed,
	RpcExceptionCodeEnum.unknownService,
	RpcExceptionCodeEnum.unknownMethod,
]);
const rpcTypeOnlyFieldNamesSchema = z.array(z.literal("type")).length(1);
const rpcTypeValueFieldNamesSchema = z
	.array(z.enum(["type", "value"]))
	.length(2);
const rpcTypeCodeFieldNamesSchema = z.array(z.enum(["type", "code"])).length(2);
const rpcIncomingCallFieldNamesSchema = z
	.array(z.enum(["service", "method", "args"]))
	.length(3);
const rpcCallOutcomeSchema = z.union([
	z.object({
		fieldNames: rpcTypeOnlyFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returnedVoid),
		}),
	}),
	z.object({
		fieldNames: rpcTypeValueFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returned),
			value: rpcApplicationSnapshotSchema,
		}),
	}),
	z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: rpcOutgoingFailureCodeSchema,
		}),
	}),
]);
const rpcHandlerTerminalSchema = z.union([
	z.object({
		fieldNames: rpcTypeOnlyFieldNamesSchema,
		fields: z.object({
			type: z.enum([
				RpcCallTerminalTypeEnum.sessionTerminated,
				RpcCallTerminalTypeEnum.returnedVoid,
			]),
		}),
	}),
	z.object({
		fieldNames: rpcTypeValueFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.returned),
			value: rpcApplicationSnapshotSchema,
		}),
	}),
	z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: z.enum([
				RpcExceptionCodeEnum.canceled,
				RpcExceptionCodeEnum.handlerFailed,
			]),
		}),
	}),
]);
const rpcIncomingCallRequestSchema = z.object({
	fieldNames: rpcIncomingCallFieldNamesSchema,
	fields: z.object({
		service: z.string().min(1),
		method: z
			.string()
			.min(1)
			.refine((method) => method !== "then"),
		args: rpcApplicationArgumentsSnapshotSchema,
	}),
});

function createRpcProtocolObjectSchema(methodNames: readonly string[]) {
	return z.unknown().superRefine((value, context) => {
		if (!isNonNullObject(value)) {
			context.addIssue({ code: "custom", message: "Expected an object." });
			return;
		}
		const protocolObject = value as object;
		for (const methodName of methodNames) {
			if (!isCallable(Reflect.get(protocolObject, methodName))) {
				context.addIssue({
					code: "custom",
					message: `Expected ${methodName} to be callable.`,
				});
				return;
			}
		}
	});
}

const rpcCommittedInvocationSchema = createRpcProtocolObjectSchema([
	"start",
	"cancel",
]);

function createRpcExpectedUnknownTerminalSchema(code: RpcUnknownCallFailure) {
	return z.object({
		fieldNames: rpcTypeCodeFieldNamesSchema,
		fields: z.object({
			type: z.literal(RpcCallTerminalTypeEnum.failed),
			code: z.literal(code),
		}),
	});
}

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

function isHandlerTerminal(value: unknown): value is RpcHandlerTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined && rpcHandlerTerminalSchema.safeParse(fields).success
	);
}

function isIncomingCallRequest(
	value: unknown,
): value is IRpcProtocolCallRequest {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		rpcIncomingCallRequestSchema.safeParse(fields).success
	);
}
