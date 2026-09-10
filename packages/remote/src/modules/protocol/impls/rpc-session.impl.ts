/**
 * @overview Coordinates Session recovery, call lifetimes, and graceful or forced termination.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import { RPC_PROTECTED_SESSION_BYTES } from "@/modules/protocol/constants/rpc-limits.const";
import { RpcProtocolSessionTransitionTypeEnum } from "@/modules/protocol/enums/rpc-protocol-session-transition-type.enum";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { IRpcCodec } from "@/modules/protocol/interfaces/rpc-codec.interface";
import type { IRpcEndpoint } from "@/modules/protocol/interfaces/rpc-endpoint.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolHost,
	IRpcProtocolInvocation,
	IRpcProtocolSessionHost,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
	RpcProtocolSessionTransitionCloseReason,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcBindingPlan,
	IRpcResumeAttempt,
	IRpcSession,
	IRpcSessionBinding,
	RpcResumeClaim,
	RpcResumeDecision,
	RpcSessionFactory,
} from "@/modules/protocol/interfaces/rpc-session.interface";
import type { RpcSessionActivityFactory } from "@/modules/protocol/interfaces/rpc-session-activity.interface";
import type {
	IRpcSessionCallRetention,
	RpcSessionCallRetentionFactory,
} from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type {
	IRpcSessionConnection,
	RpcSessionConnectionFactory,
} from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type {
	IRpcSessionContinuity,
	RpcSessionContinuityFactory,
} from "@/modules/protocol/interfaces/rpc-session-continuity.interface";
import type {
	IRpcSessionDelivery,
	RpcSessionDeliveryFactory,
} from "@/modules/protocol/interfaces/rpc-session-delivery.interface";
import type {
	IRpcSessionIncomingCalls,
	RpcSessionIncomingCallsFactory,
} from "@/modules/protocol/interfaces/rpc-session-incoming-calls.interface";
import type {
	IRpcSessionInvocations,
	RpcSessionInvocationsFactory,
} from "@/modules/protocol/interfaces/rpc-session-invocations.interface";
import type {
	IRpcSessionShutdown,
	RpcSessionShutdownFactory,
} from "@/modules/protocol/interfaces/rpc-session-shutdown.interface";
import type { RpcSemanticMessage } from "@/modules/protocol/types/rpc-wire-record.type";
import { deferRpcEndpointClose } from "@/modules/protocol/utils/rpc-direct-close.util";
import {
	registerRpcSessionRetainedBytes,
	reserveRpcSessionAndOwnerRetainedBytes,
	unregisterRpcSessionRetainedBytes,
} from "@/modules/protocol/utils/rpc-session-retained-bytes.util";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";
import type { IRpcRetainedBytesLedger } from "@/shared/interfaces/rpc-retained-bytes-ledger.interface";

export type CreateRpcSessionOptions = Parameters<RpcSessionFactory>[0];

/** Retains one Session Incarnation independently from its current Connection. */
export class RpcSessionImpl implements IRpcSession {
	readonly _host: IRpcProtocolHost;
	readonly _sessionId: string;
	readonly _codec: IRpcCodec;
	readonly _createActivity: RpcSessionActivityFactory;
	readonly _createConnection: RpcSessionConnectionFactory;
	readonly _onTerminal: () => void;
	readonly _retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly _protectedRetainedBytesReservation: IRpcRetainedBytesReservation;
	readonly _callRetention: IRpcSessionCallRetention;
	readonly _incomingCalls: IRpcSessionIncomingCalls;
	readonly _invocations: IRpcSessionInvocations;
	readonly _continuity: IRpcSessionContinuity;
	readonly _delivery: IRpcSessionDelivery;
	readonly _shutdown: IRpcSessionShutdown;
	_binding: IRpcSessionConnection | undefined;
	_recoveryDeadline: number | undefined;
	_recovering = false;
	_recoveryTimer: ReturnType<typeof setTimeout> | undefined;
	_closed = false;
	public constructor(
		options: CreateRpcSessionOptions,
		dependencies: RpcSessionImplDependencies,
	) {
		const { host, onTerminal, resumeToken, sessionId } = options;
		const {
			codec,
			createActivity,
			createCallRetention,
			createIncomingCalls,
			createInvocations,
			createConnection,
			createContinuity,
			createDelivery,
			createShutdown,
			counterExhausted = false,
			retainedBytesLedger,
		} = dependencies;
		this._host = host;
		this._retainedBytesLedger = retainedBytesLedger;
		const protectedRetainedBytesReservation = this._retainedBytesLedger.reserve(
			RPC_PROTECTED_SESSION_BYTES,
		);
		if (protectedRetainedBytesReservation === undefined) {
			throw new Error(
				"Default RPC Session cannot protect retained control state.",
			);
		}
		this._protectedRetainedBytesReservation = protectedRetainedBytesReservation;
		registerRpcSessionRetainedBytes(this, (bytes) =>
			this.reserveRetainedBytes(bytes),
		);
		this._sessionId = sessionId;
		this._codec = codec;
		this._createActivity = createActivity;
		this._createConnection = createConnection;
		this._callRetention = createCallRetention({
			codec,
			policy: host.policy,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
		});
		this._incomingCalls = createIncomingCalls({
			retention: this._callRetention,
			normalizeApplicationArguments: (args) =>
				host.normalizeApplicationArguments(args),
			isDraining: () => this._shutdown.draining,
			reserveIncomingCall: (request, consume) => {
				const sessionHost = this._continuity.host;
				if (sessionHost === undefined) {
					throw new Error("Default RPC Session has no Framework host.");
				}
				return sessionHost.reserveIncomingCall(request, consume);
			},
			onTerminal: (replay) => this._delivery.queueReplay(replay),
			onFault: (error) => this._fault(RpcCloseReasonEnum.resourceFault, error),
		});
		this._invocations = createInvocations({
			codec,
			policy: host.policy,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			reserveReplay: (message) => this._callRetention.reserveReplay(message),
			normalizeApplicationValue: (value) =>
				host.normalizeApplicationValue(value),
			onReady: () => this._delivery.pump(),
			onRetired: () => this._shutdown.check(),
			onCancel: (callId) => {
				this._delivery.queueSemantic(
					Object.freeze({
						kind: RpcWireRecordKindEnum.cancel,
						callId,
					}),
				);
			},
			onFault: (reason, error) => this._fault(reason, error),
			onCounterExhausted: () => this._shutdown.beginCounterDrain(),
		});
		this._delivery = createDelivery({
			codec,
			retention: this._callRetention,
			invocations: this._invocations,
			ackDelayMs: host.policy.ackDelayMs,
			counterExhausted,
			isClosed: () => this._closed,
			getBinding: () => this._binding,
			onMessage: (message) => this._dispatchSemantic(message),
			onDrained: () => this._shutdown.check(),
			onCounterExhausted: () => this._shutdown.beginCounterDrain(),
			onTerminate: (cause) =>
				this._completeTerminal(RpcCloseReasonEnum.counterExhaustion, cause),
			onFault: (reason, cause) => this._fault(reason, cause),
			onSendFailure: (cause) => this._enterRecovery(cause),
		});
		this._continuity = createContinuity({
			sessionId,
			resumeToken,
			inspect: () => ({
				closed: this._closed,
				binding: this._binding,
				recovering: this._recovering,
				recoveryDeadline: this._recoveryDeadline,
				highestSentSequence: this._delivery.highestSentSequence,
				peerReceivedThrough: this._delivery.peerReceivedThrough,
				receivedThrough: this._delivery.receivedThrough,
			}),
			installBinding: (...args) => this._installBinding(...args),
			onTerminate: (reason, cause) => this._completeTerminal(reason, cause),
		});
		this._shutdown = createShutdown({
			deadlineMs: host.policy.shutdownDeadlineMs,
			invocations: this._invocations,
			incomingCalls: this._incomingCalls,
			delivery: this._delivery,
			getBinding: () => this._binding,
			isClosed: () => this._closed,
			isRecovering: () => this._recovering,
			onDraining: () =>
				this._continuity.host?.transition({
					type: RpcProtocolSessionTransitionTypeEnum.draining,
					reason: RpcCloseReasonEnum.counterExhaustion,
				}),
			onCounterClosed: (cause) =>
				this._completeTerminal(RpcCloseReasonEnum.counterExhaustion, cause),
			onForceClose: () => this.forceClose(),
		});
		this._onTerminal = onTerminal;
	}

	get sessionId(): string {
		return this._sessionId;
	}
	get reclaimDeadline(): number | undefined {
		return this._recovering && !this._closed && this._binding === undefined
			? this._recoveryDeadline
			: undefined;
	}
	prepareFresh(host: IRpcProtocolSessionHost): IRpcBindingPlan {
		return this._continuity.prepareFresh(host);
	}
	beginResume(): IRpcResumeAttempt {
		return this._continuity.beginResume();
	}
	reviewResume(claim: RpcResumeClaim): RpcResumeDecision {
		return this._continuity.reviewResume(claim);
	}

	reserveRetainedBytes(
		bytes: number,
	): IRpcRetainedBytesReservation | undefined {
		return this._closed
			? undefined
			: reserveRpcSessionAndOwnerRetainedBytes(
					this._retainedBytesLedger,
					(charge) => this._host.reserveRetainedBytes(charge),
					bytes,
				);
	}

	terminateForced(): void {
		this._completeTerminal(RpcCloseReasonEnum.forcedClose);
	}

	_activateBinding(binding: IRpcSessionConnection): boolean {
		// Activation applies once to the current binding of an open Session.
		const cannotActivateBinding = this._binding !== binding || this._closed;
		if (cannotActivateBinding) {
			return false;
		}
		this._cancelRecoveryDeadline();
		if (this._recovering) {
			this._recovering = false;
			this._continuity.host?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovered,
			});
		}
		if (this._binding !== binding || this._closed) {
			return false;
		}
		binding.startActivity();
		// Exit bootstrap activation before replay can reenter the peer's reply gate.
		queueMicrotask(() => this._delivery.pump());
		return this._binding === binding && !this._closed;
	}

	prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined {
		if (this._closed || this._shutdown.draining) {
			return undefined;
		}
		return this._invocations.prepareInvocation(request, finish);
	}

	shutdown(): Promise<void> {
		return this._shutdown.shutdown();
	}

	forceClose(): void {
		this._completeTerminal();
	}

	_dispatchSemantic(message: RpcSemanticMessage): void {
		if (message.kind === RpcWireRecordKindEnum.call) {
			this._incomingCalls.receiveCall(message);
			return;
		}
		if (message.kind === RpcWireRecordKindEnum.cancel) {
			this._incomingCalls.receiveCancel(message.callId);
			return;
		}
		this._invocations.receiveTerminal(message);
	}

	_enterRecovery(cause?: Error): void {
		if (this._closed) {
			return;
		}
		if (this._shutdown.counterDraining) {
			this._completeTerminal(RpcCloseReasonEnum.counterExhaustion, cause);
			return;
		}
		if (this._shutdown.draining) {
			this._completeTerminal(RpcCloseReasonEnum.forcedClose, cause);
			return;
		}
		const binding = this._binding;
		this._binding = undefined;
		const recoveryDeadlineAtLoss =
			this._recoveryTimer === undefined
				? Date.now() + this._host.policy.recoveryGraceMs
				: undefined;
		binding?.stopActivity();
		deferRpcEndpointClose(binding?.endpoint);
		if (this._recoveryTimer === undefined) {
			const recoveryDeadline =
				recoveryDeadlineAtLoss ??
				Date.now() + this._host.policy.recoveryGraceMs;
			this._recoveryDeadline = recoveryDeadline;
			this._recoveryTimer = setTimeout(
				() => this._expireRecovery(),
				Math.max(0, recoveryDeadline - Date.now()),
			);
		}
		if (!this._recovering) {
			this._recovering = true;
			this._continuity.host?.transition({
				type: RpcProtocolSessionTransitionTypeEnum.recovering,
				cause,
			});
		}
	}

	_cancelRecoveryDeadline(): void {
		if (this._recoveryTimer !== undefined) {
			clearTimeout(this._recoveryTimer);
			this._recoveryTimer = undefined;
		}
		this._recoveryDeadline = undefined;
	}

	_expireRecovery(): void {
		if (this._closed || !this._recovering) {
			return;
		}
		this._completeTerminal(RpcCloseReasonEnum.recoveryExpired);
	}

	_completeTerminal(
		reason?: RpcProtocolSessionTransitionCloseReason,
		cause?: Error,
	): void {
		if (this._closed) {
			return;
		}
		const binding = this._binding;
		this._closed = true;
		this._binding = undefined;
		try {
			this._clearTimers();
			binding?.stopActivity();
			this._invocations.terminate();
			this._incomingCalls.terminate();
			this._delivery.terminate();
			this._protectedRetainedBytesReservation.release();
			unregisterRpcSessionRetainedBytes(this);
			this._continuity.terminate();
		} finally {
			try {
				binding?.endpoint.fenceAndClose();
			} catch {
				// Terminal Direct Close is best-effort after Session state is committed.
			} finally {
				try {
					if (reason !== undefined) {
						this._continuity.host?.transition({
							type: RpcProtocolSessionTransitionTypeEnum.closed,
							reason,
							...(cause === undefined ? {} : { cause: cause }),
						});
					}
				} finally {
					try {
						this._onTerminal();
					} finally {
						this._shutdown.complete();
					}
				}
			}
		}
	}

	_fault(
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		error: Error,
	): void {
		if (this._closed) {
			return;
		}
		const sessionHost = this._continuity.host;
		if (sessionHost === undefined) {
			this.forceClose();
			return;
		}
		sessionHost.fault(reason, error);
	}

	_clearTimers(): void {
		this._delivery.stop();
		this._cancelRecoveryDeadline();
		this._shutdown.stop();
	}

	_installBinding(
		endpoint: IRpcEndpoint,
		commitAuthority: () => void,
		peerReceivedThrough: number,
		cancelRecoveryDeadline: boolean,
	): IRpcSessionBinding {
		const binding = this._createConnection({
			endpoint,
			policy: this._host.policy,
			createActivity: this._createActivity,
			isCurrent: (candidate) => this._binding === candidate && !this._closed,
			reserveRetainedBytes: (bytes) => this.reserveRetainedBytes(bytes),
			onActivate: (candidate) => this._activateBinding(candidate),
			codec: this._codec,
			delivery: this._delivery,
			isClosed: () => this._closed,
			onFault: (reason, error) => this._fault(reason, error),
			onLoss: (cause) => this._enterRecovery(cause),
			onPeerClose: () =>
				this._completeTerminal(RpcCloseReasonEnum.remoteTerminated),
			onReady: () => this._delivery.pump(),
		});
		try {
			endpoint.configureSendProgressTimeout(
				this._host.policy.sendProgressTimeoutMs,
			);
			endpoint.observeIngressIdle(() => {
				if (this._binding === binding && !this._closed) {
					this._delivery.pump();
					this._shutdown.check();
				}
			});
		} catch (error) {
			throw error instanceof Error
				? error
				: new Error("Default RPC binding Endpoint setup failed.");
		}
		this._binding?.stopActivity();
		const previousBinding = this._binding;
		commitAuthority();
		this._delivery.resumeReplay(peerReceivedThrough);
		this._binding = binding;
		if (cancelRecoveryDeadline) this._cancelRecoveryDeadline();
		this._shutdown.check();
		deferRpcEndpointClose(previousBinding?.endpoint);
		return binding;
	}
}

type RpcSessionImplDependencies = Readonly<{
	readonly codec: IRpcCodec;
	readonly createActivity: RpcSessionActivityFactory;
	readonly createCallRetention: RpcSessionCallRetentionFactory;
	readonly createIncomingCalls: RpcSessionIncomingCallsFactory;
	readonly createInvocations: RpcSessionInvocationsFactory;
	readonly createContinuity: RpcSessionContinuityFactory;
	readonly createConnection: RpcSessionConnectionFactory;
	readonly createDelivery: RpcSessionDeliveryFactory;
	readonly createShutdown: RpcSessionShutdownFactory;
	readonly counterExhausted?: boolean;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
}>;
