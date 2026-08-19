/**
 * @overview Stable caller-facing RPC Peer implementation.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import { Observable, Subject } from "rxjs";

import { createRpcError } from "@/exceptions/rpc-error.exception";
import { getRemoteServiceDescriptorData } from "@/factories/remote-service-descriptor.factory";
import type { IRemoteServiceDescriptor } from "@/interfaces/remote-service-descriptor.interface";
import type { IRpcPeer, RpcEvent } from "@/interfaces/rpc-caller.interface";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcApplicationSnapshot,
	IRpcProtocolIncomingCall,
	IRpcProtocolIncomingCallRequest,
	IRpcProtocolIncomingHandlerCall,
	IRpcProtocolSession,
	RpcCallOutcome,
	RpcHandlerOutcome,
	RpcIncomingTerminal,
	RpcProtocolIncomingCallReservation,
	RpcUnknownCallFailure,
} from "@/interfaces/rpc-protocol.interface";
import type {
	RemoteService,
	RemoteServiceImplementation,
	RpcMethodDefinitions,
} from "@/types/remote-service-descriptor.type";
import type { RpcPeerState } from "@/types/rpc-caller.type";
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
import {
	installRpcExposure,
	type RpcExposureRegistry,
	type RpcHandlerRoute,
} from "@/utils/rpc-exposure.util";
import { createRpcFacade } from "@/utils/rpc-facade.util";
import { RpcHandlerScheduler } from "@/utils/rpc-handler-scheduler.util";

export interface RpcPeerCommittedInvocation {
	readonly result: Promise<unknown>;
	start(): void;
	cancel(): void;
}

export interface RpcPeerInvocationReservation {
	commit(): RpcPeerCommittedInvocation;
	release(): void;
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

const outgoingFailureCodes = new Set([
	"canceled",
	"unavailable",
	"outcome-unknown",
	"handler-failed",
	"unknown-service",
	"unknown-method",
]);

function readProtocolFields(
	value: unknown,
): ReadonlyMap<string, unknown> | undefined {
	try {
		if (typeof value !== "object" || value === null) {
			return undefined;
		}
		const prototype = Reflect.getPrototypeOf(value);
		if (prototype !== Object.prototype && prototype !== null) {
			return undefined;
		}
		const fields = new Map<string, unknown>();
		for (const key of Reflect.ownKeys(value)) {
			if (typeof key !== "string") {
				return undefined;
			}
			const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
			if (descriptor === undefined || !("value" in descriptor)) {
				return undefined;
			}
			fields.set(key, descriptor.value);
		}
		return fields;
	} catch {
		return undefined;
	}
}

function hasExactProtocolFields(
	fields: ReadonlyMap<string, unknown>,
	keys: readonly string[],
): boolean {
	return fields.size === keys.length && keys.every((key) => fields.has(key));
}

function isRpcCallOutcome(value: unknown): value is RpcCallOutcome {
	const fields = readProtocolFields(value);
	if (fields === undefined) {
		return false;
	}
	const type = fields.get("type");
	if (type === "returned-void") {
		return hasExactProtocolFields(fields, ["type"]);
	}
	if (type === "returned") {
		return (
			hasExactProtocolFields(fields, ["type", "value"]) &&
			isRpcApplicationSnapshot(fields.get("value"))
		);
	}
	return (
		type === "failed" &&
		hasExactProtocolFields(fields, ["type", "code"]) &&
		typeof fields.get("code") === "string" &&
		outgoingFailureCodes.has(fields.get("code") as string)
	);
}

function isExpectedUnknownTerminal(
	value: unknown,
	code: RpcUnknownCallFailure,
): value is RpcIncomingTerminal {
	const fields = readProtocolFields(value);
	return (
		fields !== undefined &&
		hasExactProtocolFields(fields, ["type", "code"]) &&
		fields.get("type") === "failed" &&
		fields.get("code") === code
	);
}

type RpcHandlerTerminal =
	| { readonly type: "returned-void" }
	| {
			readonly type: "returned";
			readonly value: IRpcApplicationSnapshot;
	  }
	| {
			readonly type: "failed";
			readonly code: "canceled" | "handler-failed";
	  }
	| { readonly type: "session-terminated" };

function isHandlerTerminal(value: unknown): value is RpcHandlerTerminal {
	const fields = readProtocolFields(value);
	if (fields === undefined) {
		return false;
	}
	const type = fields.get("type");
	if (type === "session-terminated" || type === "returned-void") {
		return hasExactProtocolFields(fields, ["type"]);
	}
	if (type === "returned") {
		return (
			hasExactProtocolFields(fields, ["type", "value"]) &&
			isRpcApplicationSnapshot(fields.get("value"))
		);
	}
	const code = fields.get("code");
	return (
		type === "failed" &&
		hasExactProtocolFields(fields, ["type", "code"]) &&
		(code === "canceled" || code === "handler-failed")
	);
}

function isIncomingCallRequest(
	value: unknown,
): value is IRpcProtocolIncomingCallRequest {
	const fields = readProtocolFields(value);
	if (
		fields === undefined ||
		!hasExactProtocolFields(fields, ["service", "method", "args"])
	) {
		return false;
	}
	const service = fields.get("service");
	const method = fields.get("method");
	return (
		typeof service === "string" &&
		service.length > 0 &&
		typeof method === "string" &&
		method.length > 0 &&
		method !== "then" &&
		isRpcApplicationArgumentsSnapshot(fields.get("args"))
	);
}

/** Retains one stable Peer identity and its replay-latest state snapshot. */
export class RpcPeerImpl implements IRpcPeer {
	readonly #stateSubject = new Subject<RpcPeerState>();
	readonly #localExposureRegistry: RpcExposureRegistry = new Map();
	readonly #ownerExposureRegistry: RpcExposureRegistry;
	readonly #isOwnerActive: () => boolean;
	readonly #emitEvent: (event: RpcEvent) => void;
	readonly #onProtocolFault: (error: Error) => void;
	readonly #handlerScheduler: RpcHandlerScheduler;
	readonly #maximumIncomingBytes: number;
	#state: RpcPeerState;
	#stateDirty = false;
	#session: IRpcProtocolSession | undefined;
	#incomingReservationCount = 0;
	#incomingReservationBytes = 0;
	readonly state$: Observable<RpcPeerState>;

	constructor(
		initialState: RpcPeerState,
		ownerExposureRegistry: RpcExposureRegistry = new Map(),
		isOwnerActive: () => boolean = () => true,
		emitEvent: (event: RpcEvent) => void = () => {},
		onProtocolFault: (error: Error) => void = () => {},
		handlerScheduler: RpcHandlerScheduler = new RpcHandlerScheduler(16, 16),
		maximumIncomingBytes = 8 * 1024 * 1024,
	) {
		this.#state = Object.freeze(initialState);
		this.#ownerExposureRegistry = ownerExposureRegistry;
		this.#isOwnerActive = isOwnerActive;
		this.#emitEvent = emitEvent;
		this.#onProtocolFault = onProtocolFault;
		this.#handlerScheduler = handlerScheduler;
		this.#maximumIncomingBytes = maximumIncomingBytes;
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
		if (this.state.status === "closed") {
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

	expose<T, Definitions extends RpcMethodDefinitions<T>>(
		descriptor: IRemoteServiceDescriptor<T, Definitions>,
		implementation: NoInfer<RemoteServiceImplementation<T, Definitions>>,
	): Cleanup {
		if (
			!this.#isOwnerActive() ||
			this.state.status === "draining" ||
			this.state.status === "closed"
		) {
			throw createRpcError("unavailable");
		}
		return installRpcExposure(
			descriptor,
			implementation,
			this.#localExposureRegistry,
			[this.#ownerExposureRegistry],
		);
	}

	resolve<T, Definitions extends RpcMethodDefinitions<T>>(
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
		if (
			!this.#isOwnerActive() ||
			(this.state.status !== "connected" &&
				this.state.status !== "recovering") ||
			this.#session === undefined
		) {
			return Promise.reject(createRpcError("unavailable"));
		}
		const args = normalizeRpcApplicationArguments(
			prepared.applicationArguments,
		);
		let reservation: RpcPeerInvocationReservation | undefined;
		try {
			reservation = this.reserveOutgoingProtocolInvocation(
				service,
				method,
				args,
			);
		} catch (error) {
			return Promise.reject(error);
		}
		if (reservation === undefined) {
			return Promise.reject(createRpcError("unavailable"));
		}

		let invocation: RpcPeerCommittedInvocation;
		try {
			invocation = reservation.commit();
		} catch (error) {
			return Promise.reject(error);
		}
		let removeAbortListener: (() => void) | undefined;
		if (prepared.signal !== undefined) {
			removeAbortListener = installRpcAbortListener(
				prepared.signal,
				invocation.cancel,
			);
		}
		invocation.start();
		return invocation.result.then(
			(value) => {
				removeAbortListener?.();
				return value;
			},
			(error: unknown) => {
				removeAbortListener?.();
				throw error;
			},
		);
	}

	/** Package-private all-or-none group reservation seam. */
	reserveOutgoingProtocolInvocation(
		service: string,
		method: string,
		args: IRpcApplicationArgumentsSnapshot,
	): RpcPeerInvocationReservation | undefined {
		if (
			!this.#isOwnerActive() ||
			(this.state.status !== "connected" &&
				this.state.status !== "recovering") ||
			this.#session === undefined
		) {
			return undefined;
		}

		let reservation: ReturnType<IRpcProtocolSession["reserveInvocation"]>;
		try {
			reservation = this.#session.reserveInvocation({ service, method, args });
		} catch (error) {
			throw this.#protocolFailure(error);
		}
		if (reservation === undefined) {
			return undefined;
		}
		if (
			typeof reservation !== "object" ||
			reservation === null ||
			typeof reservation.commit !== "function" ||
			typeof reservation.release !== "function"
		) {
			throw this.#protocolFailure(new Error("Invalid invocation reservation."));
		}

		let state: "pending" | "committed" | "released" = "pending";
		return Object.freeze<RpcPeerInvocationReservation>({
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
	): RpcPeerCommittedInvocation {
		let resolveResult!: (value: unknown) => void;
		let rejectResult!: (error: unknown) => void;
		const result = new Promise<unknown>((resolve, reject) => {
			resolveResult = resolve;
			rejectResult = reject;
		});
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
			if (outcome.type === "returned" || outcome.type === "returned-void") {
				this.#emitEvent({
					type: "call-finished",
					observationId,
					peer: this,
					direction: "outgoing",
					service,
					method,
					outcome: "fulfilled",
					durationMs,
				});
				resolveResult(
					outcome.type === "returned" ? outcome.value.value : undefined,
				);
				return;
			}

			this.#emitEvent({
				type: "call-finished",
				observationId,
				peer: this,
				direction: "outgoing",
				service,
				method,
				outcome: "rejected",
				code: outcome.code,
				durationMs,
			});
			rejectResult(createRpcError(outcome.code));
		};

		let protocolInvocation: ReturnType<typeof reservation.commit>;
		try {
			protocolInvocation = reservation.commit({ finish });
		} catch (error) {
			throw this.#protocolFailure(error);
		}
		if (
			typeof protocolInvocation !== "object" ||
			protocolInvocation === null ||
			typeof protocolInvocation.start !== "function" ||
			typeof protocolInvocation.cancel !== "function"
		) {
			throw this.#protocolFailure(new Error("Invalid committed invocation."));
		}

		this.#emitEvent({
			type: "call-started",
			observationId,
			peer: this,
			direction: "outgoing",
			service,
			method,
		});
		published = true;
		if (queuedOutcome !== undefined) {
			finish(queuedOutcome);
		}

		let canceled = false;
		let started = false;
		return Object.freeze<RpcPeerCommittedInvocation>({
			result,
			cancel: () => {
				if (settled || canceled) {
					return;
				}
				canceled = true;
				try {
					protocolInvocation.cancel();
				} catch (error) {
					rejectResult(this.#protocolFailure(error));
				}
			},
			start: () => {
				if (settled || canceled || started) {
					return;
				}
				started = true;
				try {
					protocolInvocation.start();
				} catch (error) {
					rejectResult(this.#protocolFailure(error));
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
		if (
			this.state.status !== "connected" ||
			this.#incomingReservationCount >= 256 ||
			charge > this.#maximumIncomingBytes - this.#incomingReservationBytes
		) {
			return undefined;
		}
		this.#incomingReservationCount += 1;
		this.#incomingReservationBytes += charge;
		const exposure =
			this.#localExposureRegistry.get(request.service) ??
			this.#ownerExposureRegistry.get(request.service);
		if (exposure === undefined) {
			return this.#reserveUnknownIncoming("unknown-service", charge);
		}
		const route = exposure.methods.get(request.method);
		if (route === undefined) {
			return this.#reserveUnknownIncoming(
				"unknown-method",
				charge,
				exposure.wireName,
			);
		}
		return this.#reserveHandlerIncoming(
			request,
			exposure.wireName,
			route,
			charge,
		);
	}

	#releaseIncomingCapacity(charge: number): void {
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
				this.#releaseIncomingCapacity(charge);
				const durationMs = observationDuration(startedAt);
				if (code === "unknown-service") {
					this.#emitEvent({
						type: "call-finished",
						observationId,
						peer: this,
						direction: "incoming",
						outcome: "rejected",
						code: "unknown-service",
						durationMs,
					});
				} else {
					this.#emitEvent({
						type: "call-finished",
						observationId,
						peer: this,
						direction: "incoming",
						service: service as string,
						outcome: "rejected",
						code: "unknown-method",
						durationMs,
					});
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
							new Error("Incoming reservation was committed more than once."),
						);
						return call;
					}
					state = "committed";
					observationId = createObservationId();
					startedAt = Date.now();
					const base = {
						type: "call-started" as const,
						observationId,
						peer: this,
						direction: "incoming" as const,
					};
					this.#emitEvent(
						code === "unknown-service"
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
					this.#releaseIncomingCapacity(charge);
				},
			}),
		};
	}

	#reserveHandlerIncoming(
		request: IRpcProtocolIncomingCallRequest,
		service: string,
		route: RpcHandlerRoute,
		charge: number,
	): RpcProtocolIncomingCallReservation {
		let state: "pending" | "committed" | "released" = "pending";
		let settled = false;
		let handlerStarted = false;
		let observationId = "";
		let startedAt = 0;
		const abortController = new AbortController();
		let resolveHandlerOutcome!: (outcome: RpcHandlerOutcome) => void;
		const handlerOutcome = new Promise<RpcHandlerOutcome>((resolve) => {
			resolveHandlerOutcome = resolve;
		});

		const call = Object.freeze<IRpcProtocolIncomingHandlerCall>({
			handlerOutcome,
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
				this.#releaseIncomingCapacity(charge);
				if (
					outcome.type === "session-terminated" ||
					(outcome.type === "failed" && outcome.code === "canceled")
				) {
					abortController.abort();
				}
				if (!handlerStarted) {
					resolveHandlerOutcome({ type: "not-started" });
				}
				const base = {
					type: "call-finished" as const,
					observationId,
					peer: this,
					direction: "incoming" as const,
					service,
					method: request.method,
					durationMs: observationDuration(startedAt),
				};
				if (outcome.type === "session-terminated") {
					this.#emitEvent({ ...base, outcome: "terminated" });
				} else if (
					outcome.type === "returned" ||
					outcome.type === "returned-void"
				) {
					this.#emitEvent({ ...base, outcome: "fulfilled" });
				} else {
					this.#emitEvent({
						...base,
						outcome: "rejected",
						code: outcome.code,
					});
				}
			},
		});

		const runHandler = (releasePermit: () => void): boolean => {
			if (settled) {
				resolveHandlerOutcome({ type: "not-started" });
				return false;
			}
			handlerStarted = true;
			const args: unknown[] = [...request.args.value];
			if (route.cancelable) {
				args.push(abortController.signal);
			}
			let result: unknown;
			try {
				result = Reflect.apply(route.handler, route.implementation, args);
			} catch {
				resolveHandlerOutcome({ type: "failed", code: "handler-failed" });
				releasePermit();
				return true;
			}
			void Promise.resolve(result).then(
				(value) => {
					if (settled) {
						resolveHandlerOutcome({
							type: "failed",
							code: "handler-failed",
						});
						releasePermit();
						return;
					}
					try {
						if (value === undefined) {
							resolveHandlerOutcome({ type: "returned-void" });
						} else {
							const snapshot = normalizeRpcApplicationValue(value);
							if (settled) {
								resolveHandlerOutcome({
									type: "failed",
									code: "handler-failed",
								});
								return;
							}
							resolveHandlerOutcome({
								type: "returned",
								value: snapshot,
							});
						}
					} catch {
						resolveHandlerOutcome({
							type: "failed",
							code: "handler-failed",
						});
					} finally {
						releasePermit();
					}
				},
				() => {
					resolveHandlerOutcome({
						type: "failed",
						code: "handler-failed",
					});
					releasePermit();
				},
			);
			return true;
		};

		return {
			kind: "handler",
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
						type: "call-started",
						observationId,
						peer: this,
						direction: "incoming",
						service,
						method: request.method,
					});
					this.#handlerScheduler.enqueue(this, runHandler);
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
					this.#releaseIncomingCapacity(charge);
				},
			}),
		};
	}

	#protocolFailure(error: unknown): Error {
		const cause =
			error instanceof Error ? error : new Error("Protocol invocation failed.");
		this.#onProtocolFault(cause);
		return createRpcError("protocol", cause);
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
