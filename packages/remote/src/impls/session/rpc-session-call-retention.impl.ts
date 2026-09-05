/**
 * @overview Owns incoming terminal selection, replay payload custody, and ACK retirement.
 * @author AEPKILL
 * @created 2026-09-05 15:00:00
 */

import { RpcCallTerminalTypeEnum } from "@/enums/protocol/rpc-call-terminal-type.enum";
import { RpcWireRecordKindEnum } from "@/enums/protocol/rpc-wire-record-kind.enum";
import { RpcExceptionCodeEnum } from "@/enums/rpc-exception-code.enum";
import type {
	IRpcProtocolIncomingCall,
	IRpcRetainedBytesReservation,
	RpcIncomingTerminal,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcReplayReservation,
	IRpcRetainedIncomingCall,
	IRpcRetainedTerminal,
	IRpcSessionCallRetention,
	RpcSessionCallRetentionFactory,
} from "@/interfaces/session/rpc-session-call-retention.interface";
import type {
	RpcErrorMessage,
	RpcResultMessage,
	RpcSemanticMessage,
	RpcWireErrorCode,
} from "@/types/protocol/rpc-wire-record.type";

export type CreateRpcSessionCallRetentionOptions =
	Parameters<RpcSessionCallRetentionFactory>[0];

/** Retains delivery evidence without owning transport or invocation admission. */
export class RpcSessionCallRetentionImpl implements IRpcSessionCallRetention {
	readonly _codec: CreateRpcSessionCallRetentionOptions["codec"];
	readonly _policy: CreateRpcSessionCallRetentionOptions["policy"];
	readonly _reserveRetainedBytes: CreateRpcSessionCallRetentionOptions["reserveRetainedBytes"];
	readonly _incoming = new Map<string, IRpcIncomingRetention>();
	readonly _replay = new Map<number, IRpcReplayRetention>();
	readonly _leases = new WeakMap<IRpcReplayReservation, IRpcReplayRetention>();
	_replayBarrier: number[] = [];
	_replayBytes = 0;
	_ordinaryReplayCount = 0;
	_terminalReplayCount = 0;
	_terminalPayloadCount = 0;
	_terminalReplayBytes = 0;
	_cancelReplayCount = 0;
	_closed = false;

	constructor(options: CreateRpcSessionCallRetentionOptions) {
		this._codec = options.codec;
		this._policy = Object.freeze({ ...options.policy });
		this._reserveRetainedBytes = options.reserveRetainedBytes;
	}

	get incomingCount(): number {
		return this._incoming.size;
	}

	get hasActiveIncoming(): boolean {
		return [...this._incoming.values()].some(
			(entry) =>
				!entry.selected &&
				entry.terminalOnClose.type ===
					RpcCallTerminalTypeEnum.sessionTerminated,
		);
	}

	get replayCount(): number {
		return this._replay.size;
	}

	get hasReplayBarrier(): boolean {
		return this._replayBarrier.length !== 0;
	}

	retainIncoming(
		callId: string,
		terminalOnClose: Parameters<IRpcSessionCallRetention["retainIncoming"]>[1],
	): IRpcRetainedIncomingCall {
		const entry: IRpcIncomingRetention = {
			callId,
			terminalOnClose,
			selected: false,
		};
		this._incoming.set(callId, entry);
		return Object.freeze({
			attach: (call: IRpcProtocolIncomingCall) => {
				if (this._closed) {
					call.finish(terminalOnClose);
					return;
				}
				entry.call = call;
			},
			selectCompletion: (outcome: RpcRetainedCompletionOutcome) =>
				this._selectCompletion(entry, outcome),
		});
	}

	rejectIncoming(callId: string): IRpcRetainedTerminal {
		const entry: IRpcIncomingRetention = {
			callId,
			terminalOnClose: { type: RpcCallTerminalTypeEnum.sessionTerminated },
			selected: true,
		};
		this._incoming.set(callId, entry);
		return Object.freeze({
			replay: this._reserveReplay(
				createTerminalMessage(callId, RpcExceptionCodeEnum.unavailable),
				entry,
			),
			publish() {},
		});
	}

	cancelIncoming(callId: string): IRpcRetainedTerminal | undefined {
		const entry = this._incoming.get(callId);
		return entry === undefined || entry.call === undefined
			? undefined
			: this._selectCompletion(entry, {
					type: RpcCallTerminalTypeEnum.failed,
					code: RpcExceptionCodeEnum.canceled,
				});
	}

	reserveReplay(
		message: RpcSemanticMessage,
	): IRpcReplayReservation | undefined {
		return this._reserveReplay(message);
	}

	commitReplay(sequence: number, replay: IRpcReplayReservation): void {
		const retained = this._leases.get(replay);
		if (retained === undefined || retained.released || retained.committed) {
			throw new Error(
				"Default RPC replay lease is not available for admission.",
			);
		}
		retained.committed = true;
		this._replay.set(sequence, retained);
		if (retained.incoming !== undefined) {
			retained.incoming.terminalSequence = sequence;
		}
	}

	acknowledge(ackThrough: number): void {
		for (const [sequence, replay] of this._replay) {
			if (sequence <= ackThrough) {
				this._releaseReplay(replay);
				this._replay.delete(sequence);
			}
		}
		this._replayBarrier = this._replayBarrier.filter(
			(sequence) => sequence > ackThrough,
		);
		for (const [callId, incoming] of this._incoming) {
			const terminalIsAcknowledged =
				incoming.terminalSequence !== undefined &&
				incoming.terminalSequence <= ackThrough;
			if (terminalIsAcknowledged) {
				this._incoming.delete(callId);
			}
		}
	}

	resumeReplay(peerReceivedThrough: number): void {
		this.acknowledge(peerReceivedThrough);
		this._replayBarrier = [...this._replay.keys()];
	}

	takeReplay():
		| Readonly<{ sequence: number; message: RpcSemanticMessage }>
		| undefined {
		const sequence = this._replayBarrier.shift();
		if (sequence === undefined) {
			return undefined;
		}
		const replay = this._replay.get(sequence);
		if (replay === undefined) {
			throw new Error("Default RPC replay barrier lost a retained message.");
		}
		return { sequence, message: replay.message };
	}

	terminateIncoming(): void {
		this._closed = true;
		for (const entry of this._incoming.values()) {
			if (entry.selected) {
				continue;
			}
			entry.selected = true;
			const call = entry.call;
			entry.call = undefined;
			call?.finish(entry.terminalOnClose);
		}
		this._incoming.clear();
	}

	releaseReplay(): void {
		for (const replay of this._replay.values()) {
			this._releaseReplay(replay);
		}
		this._replay.clear();
		this._replayBarrier.length = 0;
	}

	_selectCompletion(
		entry: IRpcIncomingRetention,
		outcome: RpcRetainedCompletionOutcome,
	): IRpcRetainedTerminal | undefined {
		if (this._closed || entry.selected) {
			return undefined;
		}
		entry.selected = true;
		// Detach the Framework handle before preflight, send, or terminal publication.
		let call = entry.call;
		entry.call = undefined;
		let terminal: RpcIncomingTerminal;
		let replay: IRpcReplayReservation | undefined;
		if (outcome.type === RpcCallTerminalTypeEnum.returned) {
			replay = this._reserveReplay(
				Object.freeze({
					kind: RpcWireRecordKindEnum.result,
					callId: entry.callId,
					value: outcome.value.value,
				}) as RpcResultMessage,
				entry,
			);
		} else if (outcome.type === RpcCallTerminalTypeEnum.returnedVoid) {
			replay = this._reserveReplay(
				Object.freeze({
					kind: RpcWireRecordKindEnum.result,
					callId: entry.callId,
				}) as RpcResultMessage,
				entry,
			);
		}
		if (
			replay !== undefined &&
			outcome.type !== RpcCallTerminalTypeEnum.notStarted
		) {
			terminal = outcome;
		} else {
			const code =
				outcome.type === RpcCallTerminalTypeEnum.failed
					? outcome.code
					: RpcExceptionCodeEnum.handlerFailed;
			terminal = { type: RpcCallTerminalTypeEnum.failed, code };
			replay = this._reserveReplay(
				createTerminalMessage(entry.callId, code),
				entry,
			);
		}
		return Object.freeze({
			replay,
			publish: () => {
				const finishedCall = call;
				call = undefined;
				finishedCall?.finish(terminal);
			},
		});
	}

	_reserveReplay(
		message: RpcSemanticMessage,
		incoming?: IRpcIncomingRetention,
	): IRpcReplayReservation | undefined {
		if (this._closed) {
			return undefined;
		}
		let maximumEnvelope: Uint8Array;
		try {
			maximumEnvelope = this._codec.encode({
				kind: RpcWireRecordKindEnum.message,
				seq: Number.MAX_SAFE_INTEGER,
				ackThrough: Number.MAX_SAFE_INTEGER,
				message,
			});
		} catch {
			return undefined;
		}
		const ordinaryCharge = maximumEnvelope.byteLength + 256;
		const resourceClass =
			message.kind === RpcWireRecordKindEnum.error
				? "terminal"
				: message.kind === RpcWireRecordKindEnum.cancel
					? "cancel"
					: "ordinary";
		const charge =
			resourceClass === "terminal"
				? 768
				: resourceClass === "cancel"
					? 384
					: ordinaryCharge;
		const maximumEntries = this._policy.maxPendingInvocationsPerSession * 4;
		const maximumBytes = Math.floor(
			this._policy.maxRetainedBytesPerSession / 2,
		);
		const maximumTerminalBytes = Math.floor(
			this._policy.maxRetainedBytesPerSession / 4,
		);
		const isTerminalPayload = message.kind === RpcWireRecordKindEnum.result;
		let retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
		const ordinaryReplayCapacityExceeded =
			this._ordinaryReplayCount >= maximumEntries ||
			charge > maximumBytes - this._replayBytes ||
			(isTerminalPayload &&
				(this._terminalPayloadCount >= 256 ||
					charge > maximumTerminalBytes - this._terminalReplayBytes));
		if (resourceClass === "terminal") {
			if (ordinaryCharge > charge || this._terminalReplayCount >= 256) {
				return undefined;
			}
			this._terminalReplayCount += 1;
		} else if (resourceClass === "cancel") {
			if (ordinaryCharge > charge || this._cancelReplayCount >= 256) {
				return undefined;
			}
			this._cancelReplayCount += 1;
		} else if (ordinaryReplayCapacityExceeded) {
			return undefined;
		} else {
			retainedBytesReservation = this._reserveRetainedBytes(charge);
			if (retainedBytesReservation === undefined) {
				return undefined;
			}
			this._ordinaryReplayCount += 1;
			this._replayBytes += charge;
			if (isTerminalPayload) {
				this._terminalPayloadCount += 1;
				this._terminalReplayBytes += charge;
			}
		}
		const retained: IRpcReplayRetention = {
			message,
			incoming,
			charge,
			retainedBytesReservation,
			resourceClass,
			released: false,
			committed: false,
		};
		const lease = Object.freeze({
			message,
			release: () => this._releaseReplay(retained),
		});
		this._leases.set(lease, retained);
		return lease;
	}

	_releaseReplay(replay: IRpcReplayRetention): void {
		if (replay.released) {
			return;
		}
		replay.released = true;
		replay.retainedBytesReservation?.release();
		if (replay.resourceClass === "terminal") {
			this._terminalReplayCount -= 1;
			return;
		}
		if (replay.resourceClass === "cancel") {
			this._cancelReplayCount -= 1;
			return;
		}
		this._ordinaryReplayCount -= 1;
		this._replayBytes -= replay.charge;
		if (replay.message.kind === RpcWireRecordKindEnum.result) {
			this._terminalPayloadCount -= 1;
			this._terminalReplayBytes -= replay.charge;
		}
	}
}

type RpcRetainedCompletionOutcome = Parameters<
	IRpcRetainedIncomingCall["selectCompletion"]
>[0];

interface IRpcIncomingRetention {
	readonly callId: string;
	readonly terminalOnClose: RpcIncomingTerminal;
	call?: IRpcProtocolIncomingCall;
	selected: boolean;
	terminalSequence?: number;
}

interface IRpcReplayRetention {
	readonly message: RpcSemanticMessage;
	readonly incoming: IRpcIncomingRetention | undefined;
	readonly charge: number;
	readonly retainedBytesReservation: IRpcRetainedBytesReservation | undefined;
	readonly resourceClass: "ordinary" | "terminal" | "cancel";
	released: boolean;
	committed: boolean;
}

function createTerminalMessage(
	callId: string,
	code: RpcWireErrorCode,
): RpcErrorMessage {
	return Object.freeze({
		kind: RpcWireRecordKindEnum.error,
		callId,
		error: Object.freeze({
			code,
			message: `Remote call failed with code ${code}.`,
		}),
	}) as RpcErrorMessage;
}
