/**
 * @overview Owns delivery sequence continuity, receipt ACKs, and fair replay/control/invocation scheduling.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import {
	RPC_LAST_ORDINARY_SEQUENCE,
	RPC_MAX_COUNTER,
} from "@/modules/protocol/constants/rpc-limits.const";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { IRpcCodec } from "@/modules/protocol/interfaces/rpc-codec.interface";
import type {
	IRpcReplayReservation,
	IRpcSessionCallRetention,
} from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type { IRpcSessionConnection } from "@/modules/protocol/interfaces/rpc-session-connection.interface";
import type {
	IRpcSessionDelivery,
	RpcSessionDeliveryFactory,
} from "@/modules/protocol/interfaces/rpc-session-delivery.interface";
import type { IRpcSessionInvocations } from "@/modules/protocol/interfaces/rpc-session-invocations.interface";
import type {
	RpcJsonRecord,
	RpcMessageEnvelope,
	RpcSemanticMessage,
} from "@/modules/protocol/types/rpc-wire-record.type";
import { createRpcMessageEnvelope } from "@/modules/protocol/utils/rpc-message-envelope.util";
import { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type CreateRpcSessionDeliveryOptions =
	Parameters<RpcSessionDeliveryFactory>[0];

export class RpcSessionDeliveryImpl implements IRpcSessionDelivery {
	readonly _codec: IRpcCodec;
	readonly _callRetention: IRpcSessionCallRetention;
	readonly _invocations: IRpcSessionInvocations;
	readonly _ackDelayMs: number;
	readonly _isClosed: () => boolean;
	readonly _getBinding: CreateRpcSessionDeliveryOptions["getBinding"];
	readonly _onMessage: CreateRpcSessionDeliveryOptions["onMessage"];
	readonly _onDrained: () => void;
	readonly _onCounterExhausted: () => void;
	readonly _onTerminate: CreateRpcSessionDeliveryOptions["onTerminate"];
	readonly _fault: CreateRpcSessionDeliveryOptions["onFault"];
	readonly _onSendFailure: CreateRpcSessionDeliveryOptions["onSendFailure"];
	readonly _controlQueue: IRpcReplayReservation[] = [];
	_nextOutgoingSequence: number;
	_outgoingSequenceExhausted = false;
	_highestSentSequence = 0;
	_receivedThrough = 0;
	_peerReceivedThrough = 0;
	_preferControl = true;
	_ackDirty = false;
	_ackDue = false;
	_ackTimer: ReturnType<typeof setTimeout> | undefined;
	_probeSentLast = false;

	constructor(options: CreateRpcSessionDeliveryOptions) {
		this._codec = options.codec;
		this._callRetention = options.retention;
		this._invocations = options.invocations;
		this._ackDelayMs = options.ackDelayMs;
		this._isClosed = options.isClosed;
		this._getBinding = options.getBinding;
		this._onMessage = options.onMessage;
		this._onDrained = options.onDrained;
		this._onCounterExhausted = options.onCounterExhausted;
		this._onTerminate = options.onTerminate;
		this._fault = options.onFault;
		this._onSendFailure = options.onSendFailure;
		this._nextOutgoingSequence = options.counterExhausted
			? RPC_LAST_ORDINARY_SEQUENCE + 1
			: 1;
	}

	get highestSentSequence(): number {
		return this._highestSentSequence;
	}
	get receivedThrough(): number {
		return this._receivedThrough;
	}
	get peerReceivedThrough(): number {
		return this._peerReceivedThrough;
	}
	get hasUnsettled(): boolean {
		return (
			this._controlQueue.length !== 0 ||
			this._callRetention.hasReplayBarrier ||
			this._callRetention.replayCount !== 0 ||
			this._ackDirty ||
			this._ackDue
		);
	}

	resumeReplay(peerReceivedThrough: number): void {
		this._peerReceivedThrough = peerReceivedThrough;
		this._callRetention.resumeReplay(peerReceivedThrough);
	}

	stop(): void {
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
	}

	terminate(): void {
		this.stop();
		this._releaseReplayState();
	}

	receiveEnvelope(envelope: RpcMessageEnvelope): boolean {
		// An included ACK must advance only through retained sent evidence.
		const ackIsInvalid =
			envelope.ackThrough !== undefined &&
			!this.acknowledge(envelope.ackThrough);
		if (ackIsInvalid) {
			return false;
		}
		const expected = this._receivedThrough + 1;
		if (envelope.seq <= this._receivedThrough) {
			this._markAckDirty();
			return true;
		}
		if (envelope.seq !== expected) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC message sequence contains a gap."),
			);
			return false;
		}

		try {
			this._onMessage(envelope.message);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC semantic message is invalid."),
			);
			return false;
		}
		if (this._isClosed()) {
			return false;
		}
		this._receivedThrough = envelope.seq;
		this._markAckDirty();
		return true;
	}

	queueReplay(replay: IRpcReplayReservation): void {
		if (this._isClosed()) {
			replay.release();
			return;
		}
		this._controlQueue.push(replay);
		this.pump();
	}

	queueSemantic(message: RpcSemanticMessage): boolean {
		if (this._isClosed()) {
			return false;
		}
		const replay = this._callRetention.reserveReplay(message);
		if (replay === undefined) {
			return false;
		}
		this.queueReplay(replay);
		return true;
	}

	pump(): void {
		const binding = this._getBinding();
		// Sending requires an active current binding whose Endpoint is idle.
		const cannotPump =
			this._isClosed() ||
			binding === undefined ||
			!binding.isActive ||
			!binding.endpoint.isSendIdle;
		if (cannotPump) {
			return;
		}

		const hasReplay = this._callRetention.hasReplayBarrier;
		const control = this._controlQueue[0];
		const hasPending = this._invocations.hasPending;
		const activity = binding.activity;
		const probeDue = activity?.hasPendingProbe === true;
		const ackDue = this._ackDue && this._ackDirty;
		const nonProbeDue =
			hasReplay || control !== undefined || hasPending || ackDue;
		if (probeDue && (!this._probeSentLast || !nonProbeDue)) {
			const probe = activity.takeProbe();
			if (probe !== undefined) {
				this._probeSentLast = true;
				this._sendUnsequenced(binding, { kind: probe });
			}
			return;
		}

		if (hasReplay) {
			const replay = this._callRetention.takeReplay();
			if (replay !== undefined) {
				this._probeSentLast = false;
				this._sendEnvelope(binding, replay.sequence, replay.message);
			}
			return;
		}

		// Control traffic wins its turn when present and selected by the lane scheduler.
		const shouldSendControl =
			control !== undefined && (!hasPending || this._preferControl);
		if (shouldSendControl) {
			this._controlQueue.shift();
			this._preferControl = false;
			this._probeSentLast = false;
			this._admitSemantic(binding, control);
			return;
		}
		if (hasPending) {
			this._preferControl = true;
			this._probeSentLast = false;
			this._admitNextInvocation(binding);
			return;
		}

		if (ackDue) {
			this._ackDue = false;
			this._ackDirty = false;
			this._probeSentLast = false;
			this._sendUnsequenced(binding, {
				kind: RpcWireRecordKindEnum.ack,
				ackThrough: this._receivedThrough,
			});
		}
		this._onDrained();
	}

	_admitNextInvocation(binding: IRpcSessionConnection): void {
		if (this._nextOutgoingSequence > RPC_LAST_ORDINARY_SEQUENCE) {
			this._onCounterExhausted();
			return;
		}
		const sequence = this._nextOutgoingSequence;
		this._invocations.admitNext({
			sequence,
			ackThrough: this._ackDirty ? this._receivedThrough : undefined,
			commitAndSend: (encoded, replay) => {
				// The Invocation has preflighted and committed its Call Identity. Keep
				// shared delivery identity, replay custody, and send in this same turn.
				this._nextOutgoingSequence += 1;
				this._highestSentSequence = sequence;
				this._callRetention.commitReplay(sequence, replay);
				this._consumePiggybackAck();
				this._sendEncoded(binding, encoded);
			},
		});
	}

	_admitSemantic(
		binding: IRpcSessionConnection,
		replay: IRpcReplayReservation,
	): void {
		const { message } = replay;
		// Sequenced delivery stops before the safe-integer or wire sequence limit.
		const outgoingSequenceIsExhausted =
			this._outgoingSequenceExhausted ||
			!Number.isSafeInteger(this._nextOutgoingSequence);
		if (outgoingSequenceIsExhausted) {
			replay.release();
			this._onTerminate(
				new Error("Default RPC sequence counter is exhausted."),
			);
			return;
		}
		const sequence = this._nextOutgoingSequence;
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(
				createRpcMessageEnvelope(
					sequence,
					message,
					this._ackDirty ? this._receivedThrough : undefined,
				),
			);
		} catch (error) {
			replay.release();
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				error instanceof Error
					? error
					: new Error("Default RPC terminal cannot be encoded."),
			);
			return;
		}
		if (sequence === RPC_MAX_COUNTER) {
			this._outgoingSequenceExhausted = true;
		} else {
			this._nextOutgoingSequence += 1;
		}
		this._highestSentSequence = sequence;
		this._callRetention.commitReplay(sequence, replay);
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_sendEnvelope(
		binding: IRpcSessionConnection,
		sequence: number,
		message: RpcSemanticMessage,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(
				createRpcMessageEnvelope(
					sequence,
					message,
					this._ackDirty ? this._receivedThrough : undefined,
				),
			);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.resourceFault,
				error instanceof Error
					? error
					: new Error("Default RPC replay cannot be encoded."),
			);
			return;
		}
		this._consumePiggybackAck();
		this._sendEncoded(binding, encoded);
	}

	_consumePiggybackAck(): void {
		if (!this._ackDirty) {
			return;
		}
		this._ackDirty = false;
		this._ackDue = false;
		if (this._ackTimer !== undefined) {
			clearTimeout(this._ackTimer);
			this._ackTimer = undefined;
		}
	}

	_sendUnsequenced(
		binding: IRpcSessionConnection,
		record: RpcJsonRecord,
	): void {
		let encoded: Uint8Array;
		try {
			encoded = this._codec.encode(record);
		} catch (error) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				error instanceof Error
					? error
					: new Error("Default RPC control record cannot be encoded."),
			);
			return;
		}
		this._sendEncoded(binding, encoded);
	}

	_sendEncoded(binding: IRpcSessionConnection, encoded: Uint8Array): void {
		void binding.endpoint.sendNow(encoded).then(
			() => {
				if (this._getBinding() === binding) {
					this.pump();
				}
			},
			(error) => {
				if (this._getBinding() === binding) {
					this._onSendFailure(
						error instanceof Error
							? error
							: new Error("Default RPC Connection send failed."),
					);
				}
			},
		);
	}

	acknowledge(ackThrough: number): boolean {
		if (ackThrough > this._highestSentSequence) {
			this._fault(
				RpcCloseReasonEnum.protocolFault,
				new Error("Default RPC ACK exceeds the highest sent sequence."),
			);
			return false;
		}
		if (ackThrough <= this._peerReceivedThrough) {
			return true;
		}
		this._peerReceivedThrough = ackThrough;
		this._callRetention.acknowledge(ackThrough);
		this._onDrained();
		return true;
	}

	_markAckDirty(): void {
		this._ackDirty = true;
		if (this._ackTimer !== undefined || this._ackDue) {
			return;
		}
		this._ackTimer = setTimeout(() => {
			this._ackTimer = undefined;
			this._ackDue = true;
			this.pump();
		}, this._ackDelayMs);
	}

	_releaseReplayState(): void {
		this._callRetention.releaseReplay();
		for (const queued of this._controlQueue) {
			queued.release();
		}
		this._controlQueue.length = 0;
	}
}
