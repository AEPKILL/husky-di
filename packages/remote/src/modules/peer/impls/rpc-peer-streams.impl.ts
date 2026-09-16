/**
 * @overview Bridges independent remote subscriptions to RxJS and shares captured static sources per Peer.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03
 */

import {
	defer,
	isObservable,
	map,
	Observable,
	Subscriber,
	Subscription,
	share,
} from "rxjs";
import { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "@/modules/peer/enums/rpc-call-status.enum";
import type {
	IRpcPeerCallLifecycle,
	RpcPeerCallLifecycleFactory,
} from "@/modules/peer/interfaces/rpc-peer-call-lifecycle.interface";
import { rpcCommittedInvocationSchema } from "@/modules/peer/schemas/rpc-protocol-call.schema";
import type { RpcCallContext } from "@/modules/peer/types/rpc-call-interceptor.type";
import {
	interceptRpcCall,
	normalizeRpcCallMetadata,
} from "@/modules/peer/utils/rpc-call-interceptor.util";
import {
	createObservationId,
	observationDuration,
} from "@/modules/peer/utils/rpc-call-observation.util";
import {
	isIncomingCallRequest,
	isRpcCallOutcome,
} from "@/modules/peer/utils/rpc-protocol-call.util";
import {
	type IRpcApplicationSnapshot,
	type IRpcProtocolCallRequest,
	type IRpcProtocolIncomingStream,
	type IRpcProtocolSession,
	type IRpcProtocolStreamObserver,
	isRpcApplicationSnapshot,
	normalizeRpcApplicationArguments,
	normalizeRpcApplicationValue,
	RPC_ENTRY_OVERHEAD_BYTES,
	RPC_MAX_INCOMING_JOBS,
	type RpcCallFailure,
	RpcCallTerminalTypeEnum,
} from "@/modules/protocol";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";

export type CreateRpcPeerStreamsOptions =
	Parameters<RpcPeerCallLifecycleFactory>[0];

export class RpcPeerStreamsImpl
	implements Pick<IRpcPeerCallLifecycle, "subscribe" | "openIncomingStream">
{
	readonly #options: CreateRpcPeerStreamsOptions;
	readonly #staticSources = new WeakMap<
		Observable<unknown>,
		Observable<unknown>
	>();
	#incomingCount = 0;
	#incomingBytes = 0;

	constructor(options: CreateRpcPeerStreamsOptions) {
		this.#options = options;
	}

	subscribe(
		service: string,
		method: string,
		actualArguments: readonly unknown[],
	): Observable<unknown> {
		return new Observable((subscriber) => {
			const controller = new AbortController();
			subscriber.add(() => controller.abort());
			this.#assertAvailable();
			const args = normalizeRpcApplicationArguments(actualArguments);
			const context: RpcCallContext = {
				peer: this.#options.peer,
				direction: RpcCallDirectionEnum.outgoing,
				service,
				method,
				signal: controller.signal,
				metadata: Object.freeze({}),
			};
			const invoke = () => {
				this.#assertAvailable();
				const metadata = normalizeRpcCallMetadata(context.metadata);
				return this.#openOutgoing({
					service,
					method,
					args,
					...(metadata === undefined ? {} : { metadata }),
				});
			};
			const source =
				this.#options.interceptor === undefined
					? defer(invoke)
					: interceptRpcCall(this.#options.interceptor, context, invoke);
			subscriber.add(source.subscribe(subscriber));
		});
	}

	openIncomingStream(
		request: IRpcProtocolCallRequest,
		observer: IRpcProtocolStreamObserver,
	): IRpcProtocolIncomingStream | undefined {
		if (!isIncomingCallRequest(request)) {
			const error = new Error(
				"Protocol supplied an invalid incoming stream request.",
			);
			this.#options.onProtocolFault(error);
			throw error;
		}
		const charge =
			request.args.weight +
			(request.metadata?.weight ?? 0) +
			RPC_ENTRY_OVERHEAD_BYTES;
		if (
			this.#options.peer.state.status !== RpcStateStatusEnum.connected ||
			this.#incomingCount >= RPC_MAX_INCOMING_JOBS ||
			charge > this.#options.maximumIncomingBytes - this.#incomingBytes
		)
			return undefined;
		const reservation = this.#options.reserveRetainedBytes(charge);
		if (reservation === undefined) return undefined;
		this.#incomingCount += 1;
		this.#incomingBytes += charge;
		const exposure = this.#options.findExposure(request.service);
		const route = exposure?.members.get(request.method);
		const knownRoute = route !== undefined && route.kind !== "function";
		const observationId = createObservationId();
		const startedAt = Date.now();
		const context = {
			observationId,
			peer: this.#options.peer,
			direction: RpcCallDirectionEnum.incoming,
			...(exposure === undefined ? {} : { service: exposure.wireName }),
			...(knownRoute ? { method: request.method } : {}),
		} as const;
		const controller = new AbortController();
		const subscription = new Subscription();
		const settlement = Promise.withResolvers<void>();
		let finished = false;
		let removeQueued: (() => void) | undefined;
		const finish = (code?: RpcCallFailure) => {
			if (finished) return;
			finished = true;
			removeQueued?.();
			try {
				subscription.unsubscribe();
			} catch {
				// Teardown cannot replace a durable terminal or retain handler capacity.
			}
			controller.abort();
			reservation.release();
			this.#incomingCount -= 1;
			this.#incomingBytes -= charge;
			settlement.resolve();
			this.#options.callEventSink({
				...context,
				type: RpcEventTypeEnum.streamFinished,
				outcome:
					code === undefined
						? RpcCallStatusEnum.fulfilled
						: code === RpcExceptionCodeEnum.canceled
							? RpcCallStatusEnum.terminated
							: RpcCallStatusEnum.rejected,
				...(code === undefined ? {} : { code }),
				durationMs: observationDuration(startedAt),
			});
		};
		this.#options.callEventSink({
			...context,
			type: RpcEventTypeEnum.streamOpened,
		});
		if (!knownRoute) {
			observer.error(
				exposure === undefined
					? RpcExceptionCodeEnum.unknownService
					: RpcExceptionCodeEnum.unknownMethod,
			);
			return Object.freeze({ finish });
		}
		removeQueued = this.#options.handlerScheduler.enqueue(
			this.#options.peer,
			() => {
				removeQueued = undefined;
				if (finished) return settlement.promise;
				const invoke = () =>
					defer(() => {
						if (controller.signal.aborted)
							throw createRpcException(RpcExceptionCodeEnum.canceled);
						if (route.observable !== undefined) {
							let shared = this.#staticSources.get(route.observable);
							if (shared === undefined) {
								shared = route.observable.pipe(share());
								this.#staticSources.set(route.observable, shared);
							}
							return shared;
						}
						const result = Reflect.apply(route.handler, route.implementation, [
							...request.args.value,
						]);
						if (!isObservable(result))
							throw new TypeError(
								"RPC Observable handler must return an Observable.",
							);
						return result;
					});
				const incomingContext: RpcCallContext = Object.freeze({
					peer: this.#options.peer,
					direction: RpcCallDirectionEnum.incoming,
					service: request.service,
					method: request.method,
					signal: controller.signal,
					metadata: request.metadata?.value ?? Object.freeze({}),
				});
				const source =
					this.#options.interceptor === undefined
						? invoke()
						: interceptRpcCall(
								this.#options.interceptor,
								incomingContext,
								invoke,
							);
				const sink = new Subscriber<IRpcApplicationSnapshot>({
					next: (value) => observer.next(value),
					error: () => observer.error(RpcExceptionCodeEnum.handlerFailed),
					complete: () => observer.complete(),
				});
				subscription.add(sink);
				source
					.pipe(map((value) => normalizeRpcApplicationValue(value)))
					.subscribe(sink);
				return settlement.promise;
			},
		);
		return Object.freeze({ finish });
	}

	#assertAvailable(): void {
		const status = this.#options.peer.state.status;
		if (
			!this.#options.isOwnerActive() ||
			(status !== RpcStateStatusEnum.connected &&
				status !== RpcStateStatusEnum.recovering) ||
			this.#options.getSession()?.prepareStream === undefined
		) {
			throw createRpcException(RpcExceptionCodeEnum.unavailable);
		}
	}

	#openOutgoing(request: IRpcProtocolCallRequest): Observable<unknown> {
		return new Observable((subscriber) => {
			this.#assertAvailable();
			const session = this.#options.getSession();
			const observationId = createObservationId();
			const startedAt = Date.now();
			const context = {
				observationId,
				peer: this.#options.peer,
				direction: RpcCallDirectionEnum.outgoing,
				service: request.service,
				method: request.method,
			} as const;
			let finished = false;
			let published = false;
			let publishTerminal: (() => void) | undefined;
			const finish = (code?: RpcCallFailure) => {
				if (finished) return;
				finished = true;
				const publish = () =>
					this.#options.callEventSink({
						...context,
						type: RpcEventTypeEnum.streamFinished,
						outcome:
							code === undefined
								? RpcCallStatusEnum.fulfilled
								: code === RpcExceptionCodeEnum.canceled
									? RpcCallStatusEnum.terminated
									: RpcCallStatusEnum.rejected,
						...(code === undefined ? {} : { code }),
						durationMs: observationDuration(startedAt),
					});
				if (published) publish();
				else publishTerminal = publish;
			};

			let preparing = true;
			let preparationError: Error | undefined;
			let queuedTerminal: { readonly code?: RpcCallFailure } | undefined;
			let faulting = false;
			const protocolFailure = (error: unknown): Error => {
				const cause =
					error instanceof Error
						? error
						: new Error("Protocol stream operation failed.");
				if (!faulting) {
					faulting = true;
					this.#options.onProtocolFault(cause);
					faulting = false;
				}
				return createRpcException(RpcExceptionCodeEnum.protocol, cause);
			};
			const receiveTerminal = (code?: RpcCallFailure) => {
				if (preparing) {
					if (queuedTerminal !== undefined)
						preparationError ??= new Error(
							"Protocol finished a stream twice during preparation.",
						);
					else queuedTerminal = code === undefined ? {} : { code };
					return;
				}
				if (finished) return;
				finish(code);
				if (code === undefined) subscriber.complete();
				else subscriber.error(createRpcException(code));
			};
			const invalidOutcome = (message: string) => {
				const error = new Error(message);
				if (preparing) preparationError ??= error;
				else {
					const failure = protocolFailure(error);
					finish(RpcExceptionCodeEnum.outcomeUnknown);
					subscriber.error(failure);
				}
			};
			let invocation: ReturnType<
				NonNullable<IRpcProtocolSession["prepareStream"]>
			>;
			try {
				invocation = session?.prepareStream?.(request, {
					next: (snapshot) => {
						if (!isRpcApplicationSnapshot(snapshot)) {
							invalidOutcome("Protocol supplied an invalid stream snapshot.");
							return;
						}
						if (!published) {
							invalidOutcome("Protocol emitted a stream item before start.");
							return;
						}
						if (!finished) subscriber.next(snapshot.value);
					},
					complete: () => receiveTerminal(),
					error: (code) => {
						if (
							!isRpcCallOutcome({ type: RpcCallTerminalTypeEnum.failed, code })
						) {
							invalidOutcome("Protocol supplied an invalid stream failure.");
							return;
						}
						receiveTerminal(code);
					},
				});
				if (preparationError !== undefined) throw preparationError;
				if (invocation === undefined && queuedTerminal !== undefined)
					throw new Error("Protocol finished an unavailable stream.");
				if (
					invocation !== undefined &&
					!rpcCommittedInvocationSchema.safeParse(invocation).success
				)
					throw new Error(
						"Protocol supplied invalid prepared stream controls.",
					);
				if (preparationError !== undefined) throw preparationError;
			} catch (error) {
				throw protocolFailure(error);
			}
			if (invocation === undefined)
				throw createRpcException(RpcExceptionCodeEnum.unavailable);
			preparing = false;

			subscriber.add(() => {
				if (!finished) {
					finish(RpcExceptionCodeEnum.canceled);
					try {
						invocation.cancel();
					} catch (error) {
						protocolFailure(error);
					}
				}
			});
			this.#options.callEventSink({
				...context,
				type: RpcEventTypeEnum.streamOpened,
			});
			published = true;
			publishTerminal?.();
			if (queuedTerminal !== undefined) receiveTerminal(queuedTerminal.code);
			if (!subscriber.closed) {
				try {
					invocation.start();
				} catch (error) {
					const failure = protocolFailure(error);
					finish(RpcExceptionCodeEnum.outcomeUnknown);
					subscriber.error(failure);
				}
			}
		});
	}
}
