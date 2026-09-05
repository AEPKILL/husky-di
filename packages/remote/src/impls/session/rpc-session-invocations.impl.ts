/**
 * @overview Owns outgoing invocation preparation, atomic admission, settlement, and payload custody.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcCloseReasonEnum } from "@/enums/rpc-close-reason.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type { IRpcCodec } from "@/interfaces/protocol/rpc-codec.interface";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolInvocation,
	IRpcRetainedBytesReservation,
	RpcCallOutcome,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcReplayReservation } from "@/interfaces/session/rpc-session-call-retention.interface";
import type {
	IRpcInvocationAdmission,
	IRpcSessionInvocations,
	RpcSessionInvocationsFactory,
} from "@/interfaces/session/rpc-session-invocations.interface";
import type {
	RpcCallMessage,
	RpcErrorMessage,
	RpcJsonRecord,
	RpcMessageEnvelope,
	RpcResultMessage,
} from "@/types/protocol/rpc-wire-record.type";

export type CreateRpcSessionInvocationsOptions =
	Parameters<RpcSessionInvocationsFactory>[0];

/** Keeps Pending Invocation and Logical Call lifetimes behind one outgoing-work interface. */
export class RpcSessionInvocationsImpl implements IRpcSessionInvocations {
	readonly _codec: IRpcCodec;
	readonly _maximumInvocations: number;
	readonly _maximumPendingBytes: number;
	readonly _reserveRetainedBytes: CreateRpcSessionInvocationsOptions["reserveRetainedBytes"];
	readonly _reserveReplay: CreateRpcSessionInvocationsOptions["reserveReplay"];
	readonly _normalizeApplicationValue: CreateRpcSessionInvocationsOptions["normalizeApplicationValue"];
	readonly _onReady: () => void;
	readonly _onRetired: () => void;
	readonly _onCancel: (callId: string) => void;
	readonly _onFault: CreateRpcSessionInvocationsOptions["onFault"];
	readonly _onCounterExhausted: () => void;
	readonly _invocations = new Set<IRpcInvocationEntry>();
	readonly _pendingInvocations: IRpcInvocationEntry[] = [];
	readonly _outgoingCalls = new Map<string, IRpcInvocationEntry>();
	_nextOutgoingCallOrdinal: number;
	_outgoingCallOrdinalExhausted = false;
	_invocationCount = 0;
	_pendingInvocationBytes = 0;
	_closed = false;

	constructor(
		options: CreateRpcSessionInvocationsOptions,
		initialCallOrdinal = 1,
	) {
		this._codec = options.codec;
		this._maximumInvocations = options.policy.maxPendingInvocationsPerSession;
		this._maximumPendingBytes = Math.floor(
			options.policy.maxRetainedBytesPerSession / 4,
		);
		this._reserveRetainedBytes = options.reserveRetainedBytes;
		this._reserveReplay = options.reserveReplay;
		this._normalizeApplicationValue = options.normalizeApplicationValue;
		this._onReady = options.onReady;
		this._onRetired = options.onRetired;
		this._onCancel = options.onCancel;
		this._onFault = options.onFault;
		this._onCounterExhausted = options.onCounterExhausted;
		this._nextOutgoingCallOrdinal = initialCallOrdinal;
	}

	get hasPending(): boolean {
		return this._pendingInvocations.some((entry) => !entry.retired);
	}

	get hasActive(): boolean {
		return this._invocations.size !== 0;
	}

	prepareInvocation(
		request: IRpcProtocolCallRequest,
		finish: (outcome: RpcCallOutcome) => void,
	): IRpcProtocolInvocation | undefined {
		const pendingCharge = request.args.weight + 256;
		// Preparation owns count and byte capacity without assigning a Call Identity.
		const cannotReserveInvocation =
			this._closed ||
			this._invocationCount >= this._maximumInvocations ||
			!Number.isSafeInteger(pendingCharge) ||
			pendingCharge > this._maximumPendingBytes - this._pendingInvocationBytes;
		if (cannotReserveInvocation) {
			return undefined;
		}
		const retainedBytesReservation = this._reserveRetainedBytes(pendingCharge);
		if (retainedBytesReservation === undefined) {
			return undefined;
		}
		this._invocationCount += 1;
		this._pendingInvocationBytes += pendingCharge;
		const entry: IRpcInvocationEntry = {
			request,
			finish,
			pendingCharge,
			retainedBytesReservation,
			pendingCharged: true,
			started: false,
			admitted: false,
			publicFinished: false,
			retired: false,
		};
		this._invocations.add(entry);
		return Object.freeze({
			start: () => this._startInvocation(entry),
			cancel: () => this._cancelInvocation(entry),
		});
	}

	admitNext(admission: IRpcInvocationAdmission): void {
		while (this._pendingInvocations[0]?.retired) {
			this._pendingInvocations.shift();
		}
		const entry = this._pendingInvocations[0];
		if (this._closed || entry === undefined) {
			return;
		}
		// The Session separately protects the shared delivery sequence reserve.
		const invocationCounterIsExhausted =
			this._outgoingCallOrdinalExhausted ||
			!Number.isSafeInteger(this._nextOutgoingCallOrdinal);
		if (invocationCounterIsExhausted) {
			this._onCounterExhausted();
			return;
		}
		let request = entry.request;
		if (request === undefined) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC Pending Invocation lost its request."),
			);
			return;
		}
		const callId = String(this._nextOutgoingCallOrdinal);
		let message: RpcCallMessage | undefined = Object.freeze({
			kind: RpcWireRecordKindEnum.call,
			callId,
			service: request.service,
			method: request.method,
			args: request.args.value,
		}) as RpcCallMessage;
		this._releasePendingRetainedBytes(entry);
		let replay = this._reserveReplay(message);
		if (replay === undefined) {
			// Keep the payload charged outside the entry so reentrant terminal cleanup
			// cannot release its guard before this admission frame returns.
			let retainedBytesGuard = this._reserveRetainedBytes(entry.pendingCharge);
			if (retainedBytesGuard === undefined) {
				entry.request = undefined;
				request = undefined;
				message = undefined;
				this._fault(
					RpcCloseReasonEnum.resourceFault,
					new Error("Default RPC Pending retained-byte charge was lost."),
				);
				return;
			}
			entry.request = undefined;
			request = undefined;
			message = undefined;
			this._pendingInvocations.shift();
			this._releasePendingInvocationCharge(entry);
			try {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
			} finally {
				try {
					this._retireInvocation(entry);
				} finally {
					retainedBytesGuard.release();
					retainedBytesGuard = undefined;
				}
			}
			this._onReady();
			return;
		}
		let encoded: Uint8Array;
		try {
			const envelope = (
				admission.ackThrough === undefined
					? {
							kind: RpcWireRecordKindEnum.message,
							seq: admission.sequence,
							message,
						}
					: {
							kind: RpcWireRecordKindEnum.message,
							seq: admission.sequence,
							ackThrough: admission.ackThrough,
							message,
						}
			) as RpcMessageEnvelope;
			encoded = this._codec.encode(envelope);
		} catch {
			let guardedReplay: IRpcReplayReservation | undefined = replay;
			replay = undefined;
			entry.request = undefined;
			request = undefined;
			message = undefined;
			this._pendingInvocations.shift();
			this._releasePendingInvocationCharge(entry);
			try {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
			} finally {
				try {
					this._retireInvocation(entry);
				} finally {
					guardedReplay.release();
					guardedReplay = undefined;
				}
			}
			this._onReady();
			return;
		}

		this._pendingInvocations.shift();
		if (this._nextOutgoingCallOrdinal === Number.MAX_SAFE_INTEGER) {
			this._outgoingCallOrdinalExhausted = true;
		} else {
			this._nextOutgoingCallOrdinal += 1;
		}
		entry.admitted = true;
		entry.callId = callId;
		this._releasePendingInvocationCharge(entry);
		this._outgoingCalls.set(callId, entry);
		entry.request = undefined;
		request = undefined;
		admission.commitAndSend(encoded, replay);
		if (this._outgoingCallOrdinalExhausted) {
			this._onCounterExhausted();
		}
	}

	receiveTerminal(message: RpcResultMessage | RpcErrorMessage): void {
		const invocation = this._outgoingCalls.get(message.callId);
		if (invocation === undefined) {
			throw new Error(
				`Default RPC ${message.kind} has no matching Logical Call.`,
			);
		}
		let outcome: RpcCallOutcome;
		if (message.kind === RpcWireRecordKindEnum.error) {
			if (Object.hasOwn(message.error as RpcJsonRecord, "details")) {
				this._normalizeApplicationValue(message.error.details);
			}
			outcome = {
				type: RpcCallTerminalTypeEnum.failed,
				code: message.error.code,
			};
		} else if (Object.hasOwn(message, "value")) {
			outcome = {
				type: RpcCallTerminalTypeEnum.returned,
				value: this._normalizeApplicationValue(message.value),
			};
		} else {
			outcome = { type: RpcCallTerminalTypeEnum.returnedVoid };
		}
		this._finishInvocation(invocation, outcome);
		this._retireInvocation(invocation);
	}

	rejectPending(): void {
		for (const entry of [...this._invocations]) {
			if (!entry.admitted) {
				this._finishInvocation(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.unavailable,
				});
				this._retireInvocation(entry);
			}
		}
	}

	terminate(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		for (const entry of [...this._invocations]) {
			this._finishInvocation(entry, {
				type: RpcCallTerminalTypeEnum.failed,
				code: entry.admitted
					? RpcExceptionCodeEnum.outcomeUnknown
					: RpcExceptionCodeEnum.unavailable,
			});
			this._retireInvocation(entry);
		}
	}

	_startInvocation(entry: IRpcInvocationEntry): void {
		if (entry.started) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC invocation start was called more than once."),
			);
			return;
		}
		if (entry.retired) {
			return;
		}
		entry.started = true;
		if (this._closed) {
			this._finishInvocation(entry, {
				type: RpcCallTerminalTypeEnum.failed,
				code: RpcExceptionCodeEnum.unavailable,
			});
			this._retireInvocation(entry);
			return;
		}
		this._pendingInvocations.push(entry);
		this._onReady();
	}

	_cancelInvocation(entry: IRpcInvocationEntry): void {
		if (entry.retired || entry.publicFinished) {
			return;
		}
		this._finishInvocation(entry, {
			type: RpcCallTerminalTypeEnum.failed,
			code: RpcExceptionCodeEnum.canceled,
		});
		if (!entry.admitted) {
			this._retireInvocation(entry);
			return;
		}
		this._onCancel(entry.callId as string);
	}

	_finishInvocation(entry: IRpcInvocationEntry, outcome: RpcCallOutcome): void {
		if (entry.publicFinished) {
			return;
		}
		entry.publicFinished = true;
		entry.finish(outcome);
	}

	_retireInvocation(entry: IRpcInvocationEntry): void {
		if (entry.retired) {
			return;
		}
		entry.retired = true;
		const pendingIndex = this._pendingInvocations.indexOf(entry);
		if (pendingIndex !== -1) {
			this._pendingInvocations.splice(pendingIndex, 1);
		}
		entry.request = undefined;
		this._releasePendingInvocationCharge(entry);
		this._invocations.delete(entry);
		if (entry.callId !== undefined) {
			this._outgoingCalls.delete(entry.callId);
		}
		this._invocationCount -= 1;
		this._onRetired();
	}

	_releasePendingInvocationCharge(entry: IRpcInvocationEntry): void {
		if (!entry.pendingCharged) {
			return;
		}
		entry.pendingCharged = false;
		this._pendingInvocationBytes -= entry.pendingCharge;
		this._releasePendingRetainedBytes(entry);
	}

	_releasePendingRetainedBytes(entry: IRpcInvocationEntry): void {
		const reservation = entry.retainedBytesReservation;
		entry.retainedBytesReservation = undefined;
		reservation?.release();
	}

	_fault(
		reason: RpcCloseReasonEnum.protocolFault | RpcCloseReasonEnum.resourceFault,
		error: Error,
	): void {
		if (!this._closed) {
			this._onFault(reason, error);
		}
	}
}

interface IRpcInvocationEntry {
	request?: IRpcProtocolCallRequest;
	readonly finish: (outcome: RpcCallOutcome) => void;
	readonly pendingCharge: number;
	retainedBytesReservation?: IRpcRetainedBytesReservation;
	pendingCharged: boolean;
	started: boolean;
	admitted: boolean;
	publicFinished: boolean;
	retired: boolean;
	callId?: string;
}
