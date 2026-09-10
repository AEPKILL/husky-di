/**
 * @overview Owns incoming Call Ordinals, scoped Framework admission, and terminal publication.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION } from "@/modules/protocol/constants/rpc-limits.const";
import { RpcCallTerminalTypeEnum } from "@/modules/protocol/enums/rpc-call-terminal-type.enum";
import { RpcIncomingCallKindEnum } from "@/modules/protocol/enums/rpc-incoming-call-kind.enum";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type { RpcHandlerOutcome } from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type {
	IRpcReplayReservation,
	IRpcRetainedIncomingCall,
} from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type {
	IRpcSessionIncomingCalls,
	RpcSessionIncomingCallsFactory,
} from "@/modules/protocol/interfaces/rpc-session-incoming-calls.interface";
import type {
	RpcCallMessage,
	RpcErrorMessage,
} from "@/modules/protocol/types/rpc-wire-record.type";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export type CreateRpcSessionIncomingCallsOptions =
	Parameters<RpcSessionIncomingCallsFactory>[0];

/** Keeps incoming admission and Framework publication behind one call-lifetime interface. */
export class RpcSessionIncomingCallsImpl implements IRpcSessionIncomingCalls {
	readonly _retention: CreateRpcSessionIncomingCallsOptions["retention"];
	readonly _normalizeApplicationArguments: CreateRpcSessionIncomingCallsOptions["normalizeApplicationArguments"];
	readonly _isDraining: () => boolean;
	readonly _reserveIncomingCall: CreateRpcSessionIncomingCallsOptions["reserveIncomingCall"];
	readonly _onTerminal: CreateRpcSessionIncomingCallsOptions["onTerminal"];
	readonly _onFault: CreateRpcSessionIncomingCallsOptions["onFault"];
	_highestCallOrdinal = 0;
	_closed = false;

	constructor(options: CreateRpcSessionIncomingCallsOptions) {
		this._retention = options.retention;
		this._normalizeApplicationArguments = options.normalizeApplicationArguments;
		this._isDraining = options.isDraining;
		this._reserveIncomingCall = options.reserveIncomingCall;
		this._onTerminal = options.onTerminal;
		this._onFault = options.onFault;
	}

	get hasActive(): boolean {
		return this._retention.hasActiveIncoming;
	}

	receiveCall(message: RpcCallMessage): void {
		if (this._closed) {
			return;
		}
		const args = this._normalizeApplicationArguments(message.args);
		const ordinal = Number(message.callId);
		if (ordinal !== this._highestCallOrdinal + 1) {
			throw new Error("Default RPC Call Ordinal is not contiguous.");
		}
		this._highestCallOrdinal = ordinal;
		if (
			this._isDraining() ||
			this._retention.incomingCount >= RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION
		) {
			this._rejectForCapacity(message.callId);
			return;
		}
		const reserved = this._reserveIncomingCall(
			{
				service: message.service,
				method: message.method,
				args,
			},
			(reservation) => {
				if (reservation.kind === RpcIncomingCallKindEnum.unknown) {
					const terminal = {
						type: RpcCallTerminalTypeEnum.failed,
						code: reservation.code,
					} as const;
					const entry = this._retention.retainIncoming(
						message.callId,
						terminal,
					);
					// The retained identity precedes Framework commit and its observable event.
					entry.attach(reservation.commit());
					const completion = entry.selectCompletion(terminal);
					if (completion !== undefined) {
						completion.publish();
						this._queueTerminal(completion.replay);
					}
					return undefined;
				}

				const entry = this._retention.retainIncoming(message.callId, {
					type: RpcCallTerminalTypeEnum.sessionTerminated,
				});
				// The retained identity precedes Framework commit and Handler scheduling.
				const incoming = reservation.commit();
				entry.attach(incoming);
				if (this._closed) {
					return undefined;
				}
				void incoming.handlerOutcome.then(
					(outcome) => this._finishHandler(entry, outcome),
					() =>
						this._finishHandler(entry, {
							type: RpcCallTerminalTypeEnum.failed,
							code: RpcExceptionCodeEnum.handlerFailed,
						}),
				);
				return undefined;
			},
		);
		if (!reserved) {
			this._queueTerminal(
				this._retention.rejectIncoming(message.callId).replay,
			);
		}
	}

	receiveCancel(callId: string): void {
		if (this._closed) {
			return;
		}
		if (Number(callId) > this._highestCallOrdinal) {
			throw new Error("Default RPC cancel refers to a future Call Ordinal.");
		}
		const completion = this._retention.cancelIncoming(callId);
		if (completion !== undefined) {
			completion.publish();
			this._queueTerminal(completion.replay);
		}
	}

	terminate(): void {
		if (this._closed) {
			return;
		}
		this._closed = true;
		this._retention.terminateIncoming();
	}

	_finishHandler(
		entry: IRpcRetainedIncomingCall,
		outcome: RpcHandlerOutcome,
	): void {
		const completion = entry.selectCompletion(outcome);
		if (completion !== undefined) {
			this._queueTerminal(completion.replay);
			completion.publish();
		}
	}

	_rejectForCapacity(callId: string): void {
		if (this._closed) {
			return;
		}
		const code = RpcExceptionCodeEnum.unavailable;
		const replay = this._retention.reserveReplay(
			Object.freeze({
				kind: RpcWireRecordKindEnum.error,
				callId,
				error: Object.freeze({
					code,
					message: `Remote call failed with code ${code}.`,
				}),
			}) as RpcErrorMessage,
		);
		this._queueTerminal(replay);
	}

	_queueTerminal(replay: IRpcReplayReservation | undefined): void {
		if (this._closed) {
			replay?.release();
			return;
		}
		if (replay === undefined) {
			this._onFault(
				new Error("Default RPC protected terminal reserve is exhausted."),
			);
			return;
		}
		this._onTerminal(replay);
	}
}
