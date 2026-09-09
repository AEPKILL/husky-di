/**
 * @overview Owns outgoing Framework invocation preparation, publication, cancellation and terminal observations.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { RpcCallDirectionEnum } from "@/modules/peer/enums/rpc-call-direction.enum";
import { RpcCallStatusEnum } from "@/modules/peer/enums/rpc-call-status.enum";
import type { IRpcPeer } from "@/modules/peer/interfaces/rpc-peer.interface";
import type {
	IRpcPeerCallLifecycle,
	RpcPeerCallLifecycleFactory,
} from "@/modules/peer/interfaces/rpc-peer-call-lifecycle.interface";
import { rpcCommittedInvocationSchema } from "@/modules/peer/schemas/rpc-protocol-call.schema";
import type { RpcCallEventSink } from "@/modules/peer/types/rpc-peer-call-event.type";
import {
	createObservationId,
	observationDuration,
} from "@/modules/peer/utils/rpc-call-observation.util";
import { isRpcCallOutcome } from "@/modules/peer/utils/rpc-protocol-call.util";
import type {
	IRpcApplicationArgumentsSnapshot,
	IRpcProtocolSession,
	RpcCallOutcome,
} from "@/modules/protocol";
import {
	normalizeRpcApplicationArguments,
	RpcCallTerminalTypeEnum,
} from "@/modules/protocol";
import { RpcEventTypeEnum } from "@/shared/enums/rpc-event-type.enum";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";
import { RpcStateStatusEnum } from "@/shared/enums/rpc-state-status.enum";
import { createRpcException } from "@/shared/factories/rpc-exception.factory";
import {
	installRpcAbortListener,
	prepareRpcInvocationArguments,
} from "@/shared/utils/rpc-cancellation.util";

export type CreateRpcPeerOutgoingCallsOptions = Pick<
	Parameters<RpcPeerCallLifecycleFactory>[0],
	"peer" | "getSession" | "isOwnerActive" | "callEventSink" | "onProtocolFault"
>;

export class RpcPeerOutgoingCallsImpl
	implements Pick<IRpcPeerCallLifecycle, "invoke">
{
	readonly #peer: IRpcPeer;
	readonly #getSession: () => IRpcProtocolSession | undefined;
	readonly #isOwnerActive: () => boolean;
	readonly #callEventSink: RpcCallEventSink;
	readonly #onProtocolFault: (error: Error) => void;

	constructor(options: CreateRpcPeerOutgoingCallsOptions) {
		this.#peer = options.peer;
		this.#getSession = options.getSession;
		this.#isOwnerActive = options.isOwnerActive;
		this.#callEventSink = options.callEventSink;
		this.#onProtocolFault = options.onProtocolFault;
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
