/**
 * @overview Owns incoming Framework capacity reservations, commit scopes and handler lifetimes.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "@/modules/peer/enums/rpc-call-status.enum";
import type { IRpcHandlerScheduler } from "@/modules/peer/interfaces/rpc-handler-scheduler.interface";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type {
	IRpcPeerCallLifecycle,
	RpcPeerCallLifecycleFactory,
} from "@/modules/peer/interfaces/rpc-peer-call-lifecycle.interface";
import type {
	IRpcPreparedHandlerIncomingCall,
	IRpcPreparedUnknownIncomingCall,
	RpcPreparedIncomingCall,
} from "@/modules/peer/interfaces/rpc-prepared-incoming-call.interface";
import type {
	RpcExposure,
	RpcHandlerRoute,
} from "@/modules/peer/types/rpc-exposure.type";
import type { RpcCallEventSink } from "@/modules/peer/types/rpc-peer-call-event.type";
import {
	createObservationId,
	observationDuration,
} from "@/modules/peer/utils/rpc-call-observation.util";
import {
	invokeRpcHandler,
	processRpcHandlerResult,
} from "@/modules/peer/utils/rpc-handler-result.util";
import {
	isExpectedUnknownTerminal,
	isHandlerTerminal,
	isIncomingCallRequest,
} from "@/modules/peer/utils/rpc-protocol-call.util";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingHandlerCall,
	IRpcRetainedBytesReservation,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolIncomingCallReservation,
	RpcUnknownCallFailure,
} from "@/modules/protocol";
import {
	RPC_ENTRY_OVERHEAD_BYTES,
	RPC_MAX_INCOMING_JOBS,
	RpcCallTerminalTypeEnum,
	RpcIncomingCallKindEnum,
} from "@/modules/protocol";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";

export type CreateRpcPeerIncomingCallsOptions = Omit<
	Parameters<RpcPeerCallLifecycleFactory>[0],
	"getSession" | "isOwnerActive"
>;

export class RpcPeerIncomingCallsImpl
	implements Pick<IRpcPeerCallLifecycle, "reserveIncomingCall">
{
	readonly #peer: IRpcPeer;
	readonly #findExposure: (wireName: string) => RpcExposure | undefined;
	readonly #callEventSink: RpcCallEventSink;
	readonly #onProtocolFault: (error: Error) => void;
	readonly #handlerScheduler: IRpcHandlerScheduler;
	readonly #maximumIncomingBytes: number;
	readonly #reserveRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined;
	#incomingReservationCount = 0;
	#incomingReservationBytes = 0;

	constructor(options: CreateRpcPeerIncomingCallsOptions) {
		this.#peer = options.peer;
		this.#findExposure = options.findExposure;
		this.#callEventSink = options.callEventSink;
		this.#onProtocolFault = options.onProtocolFault;
		this.#handlerScheduler = options.handlerScheduler;
		this.#maximumIncomingBytes = options.maximumIncomingBytes;
		this.#reserveRetainedBytes = options.reserveRetainedBytes;
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
		const charge = request.args.weight + RPC_ENTRY_OVERHEAD_BYTES;
		// Incoming admission must fit the Peer count and retained-byte budgets.
		const cannotReserveIncomingCall =
			this.#peer.state.status !== RpcStateStatusEnum.connected ||
			this.#incomingReservationCount >= RPC_MAX_INCOMING_JOBS ||
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
	): IRpcPreparedUnknownIncomingCall {
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
	): IRpcPreparedHandlerIncomingCall {
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
			return processRpcHandlerResult(
				result,
				() => settled,
				handlerOutcome.resolve,
			);
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
}
