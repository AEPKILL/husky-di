/**
 * @overview Retains independent stream identities and source lifetimes across Connection replacement.
 * @author AEPKILL
 * @created 2026-09-14 00:18:03 23:45:00
 */

import {
	RPC_ENTRY_OVERHEAD_BYTES,
	RPC_MAX_COUNTER,
	RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION,
	RPC_SESSION_BYTE_SUBCAP_DIVISOR,
} from "@/modules/protocol/constants/rpc-limits.const";
import { RpcWireRecordKindEnum } from "@/modules/protocol/enums/rpc-wire-record-kind.enum";
import type {
	IRpcProtocolCallRequest,
	IRpcProtocolIncomingStream,
	IRpcProtocolInvocation,
	IRpcProtocolStreamObserver,
	IRpcRetainedBytesReservation,
	RpcCallFailure,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";
import type { IRpcReplayReservation } from "@/modules/protocol/interfaces/rpc-session-call-retention.interface";
import type {
	IRpcSessionStreams,
	RpcSessionStreamsFactory,
} from "@/modules/protocol/interfaces/rpc-session-streams.interface";
import type {
	RpcStreamOpenMessage,
	RpcStreamSemanticMessage,
	RpcWireErrorCode,
} from "@/modules/protocol/types/rpc-wire-record.type";
import { RpcExceptionCodeEnum } from "@/shared/enums/rpc-exception-code.enum";

export type CreateRpcSessionStreamsOptions =
	Parameters<RpcSessionStreamsFactory>[0];

export class RpcSessionStreamsImpl implements IRpcSessionStreams {
	readonly _options: CreateRpcSessionStreamsOptions;
	readonly _outgoing = new Set<IRpcOutgoingStream>();
	readonly _incoming = new Map<string, IRpcIncomingStream>();
	_pendingBytes = 0;
	_highestOutgoing = 0;
	_highestIncoming = 0;
	_closed = false;

	constructor(options: CreateRpcSessionStreamsOptions) {
		this._options = options;
	}

	get incomingCount(): number {
		return this._incoming.size;
	}
	get outgoingCount(): number {
		return this._outgoing.size;
	}
	get pendingBytes(): number {
		return this._pendingBytes;
	}

	get hasActive(): boolean {
		return (
			this._outgoing.size !== 0 ||
			[...this._incoming.values()].some((entry) => !entry.terminal)
		);
	}

	prepare(
		request: IRpcProtocolCallRequest,
		observer: IRpcProtocolStreamObserver,
	): IRpcProtocolInvocation | undefined {
		const maximum = Math.min(
			this._options.host.policy.maxPendingInvocationsPerSession,
			RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION,
		);
		if (
			this._closed ||
			this._options.isDraining() ||
			this._outgoing.size + this._options.getOutgoingCallCount() >= maximum
		)
			return undefined;
		const pendingCharge =
			request.args.weight +
			(request.metadata?.weight ?? 0) +
			RPC_ENTRY_OVERHEAD_BYTES;
		const maximumBytes = Math.floor(
			this._options.host.policy.maxRetainedBytesPerSession /
				RPC_SESSION_BYTE_SUBCAP_DIVISOR,
		);
		if (
			pendingCharge >
			maximumBytes - this._pendingBytes - this._options.getPendingCallBytes()
		)
			return undefined;
		const reservation = this._options.reserveRetainedBytes(pendingCharge);
		if (reservation === undefined) return undefined;
		const entry: IRpcOutgoingStream = {
			request,
			observer,
			reservation,
			pendingCharge,
			admitted: false,
			started: false,
			terminal: false,
		};
		this._pendingBytes += pendingCharge;
		this._outgoing.add(entry);
		return Object.freeze({
			start: () => this._startOutgoing(entry),
			cancel: () => this._cancelOutgoing(entry),
		});
	}

	_startOutgoing(entry: IRpcOutgoingStream): void {
		if (this._closed || entry.terminal || entry.started) return;
		entry.started = true;
		entry.withdraw = this._options.delivery.queueStream(() =>
			this._admitOutgoing(entry),
		);
	}

	_admitOutgoing(entry: IRpcOutgoingStream): IRpcReplayReservation | undefined {
		if (this._closed || entry.terminal) return undefined;
		entry.withdraw = undefined;
		if (this._highestOutgoing >= RPC_MAX_COUNTER) {
			this._finishOutgoing(entry, RpcExceptionCodeEnum.unavailable);
			this._options.onCounterExhausted();
			return undefined;
		}
		const request = entry.request;
		if (request === undefined) return undefined;
		const streamId = String(this._highestOutgoing + 1);
		entry.request = undefined;
		this._releasePending(entry);
		const replay = this._options.retention.reserveReplay(
			Object.freeze({
				kind: RpcWireRecordKindEnum.streamOpen,
				streamId,
				service: request.service,
				member: request.method,
				args: request.args.value,
				...(request.metadata === undefined
					? {}
					: { metadata: request.metadata.value }),
			}),
			() => {
				this._highestOutgoing += 1;
				entry.streamId = streamId;
				entry.admitted = true;
			},
		);
		if (entry.terminal || this._closed) {
			replay?.release();
			return undefined;
		}
		if (replay === undefined)
			this._finishOutgoing(entry, RpcExceptionCodeEnum.unavailable);
		return replay;
	}

	_cancelOutgoing(entry: IRpcOutgoingStream): void {
		if (entry.terminal) return;
		entry.terminal = true;
		entry.withdraw?.();
		entry.withdraw = undefined;
		entry.request = undefined;
		this._releasePending(entry);
		const retire = () => {
			this._outgoing.delete(entry);
			this._options.onRetired();
		};
		if (entry.streamId === undefined) retire();
		else {
			const replay = this._options.retention.reserveReplay(
				Object.freeze({
					kind: RpcWireRecordKindEnum.streamCancel,
					streamId: entry.streamId,
				}),
				undefined,
				retire,
			);
			if (replay === undefined)
				this._options.onFault(
					new Error("RPC protected stream cancel reserve is exhausted."),
				);
			else this._options.delivery.queueReplay(replay);
		}
		this._options.onRetired();
	}

	_releasePending(entry: IRpcOutgoingStream): void {
		const reservation = entry.reservation;
		if (reservation === undefined) return;
		entry.reservation = undefined;
		this._pendingBytes -= entry.pendingCharge;
		reservation.release();
	}

	receive(message: RpcStreamSemanticMessage): void {
		if (this._closed) return;
		if (message.kind === RpcWireRecordKindEnum.streamOpen) {
			this._open(message);
			return;
		}
		if (message.kind === RpcWireRecordKindEnum.streamCancel) {
			if (Number(message.streamId) > this._highestIncoming)
				throw new Error("RPC stream cancel refers to a future Stream Ordinal.");
			const incoming = this._incoming.get(message.streamId);
			if (incoming !== undefined && !incoming.terminal) {
				incoming.terminal = true;
				incoming.code = RpcExceptionCodeEnum.canceled;
				this._incoming.delete(message.streamId);
				incoming.reservation.release();
				const handle = incoming.handle;
				incoming.handle = undefined;
				handle?.finish(incoming.code);
				this._options.onRetired();
			}
			return;
		}
		if (Number(message.streamId) > this._highestOutgoing)
			throw new Error("RPC stream event refers to a future Stream Ordinal.");
		const entry = [...this._outgoing].find(
			(value) => value.streamId === message.streamId,
		);
		if (entry === undefined || entry.terminal) return;
		if (message.kind === RpcWireRecordKindEnum.streamNext) {
			entry.observer.next(
				this._options.host.normalizeApplicationValue(message.value),
			);
		} else {
			this._finishOutgoing(
				entry,
				message.kind === RpcWireRecordKindEnum.streamError
					? message.error.code
					: undefined,
			);
		}
	}

	terminate(): void {
		if (this._closed) return;
		this._closed = true;
		for (const entry of this._outgoing) {
			if (entry.terminal) this._releasePending(entry);
			else
				this._finishOutgoing(
					entry,
					entry.admitted
						? RpcExceptionCodeEnum.outcomeUnknown
						: RpcExceptionCodeEnum.unavailable,
				);
		}
		this._outgoing.clear();
		for (const entry of this._incoming.values()) {
			entry.reservation.release();
			if (!entry.terminal) {
				entry.terminal = true;
				entry.code = RpcExceptionCodeEnum.outcomeUnknown;
				const handle = entry.handle;
				entry.handle = undefined;
				handle?.finish(entry.code);
			}
		}
		this._incoming.clear();
	}

	_open(message: RpcStreamOpenMessage): void {
		if (Number(message.streamId) !== this._highestIncoming + 1)
			throw new Error("RPC Stream Ordinal is not contiguous.");
		this._highestIncoming += 1;
		const request: IRpcProtocolCallRequest = {
			service: message.service,
			method: message.member,
			args: this._options.host.normalizeApplicationArguments(
				message.args ?? [],
			),
			...(message.metadata === undefined
				? {}
				: {
						metadata: this._options.host.normalizeApplicationValue(
							message.metadata,
						) as IRpcProtocolCallRequest["metadata"],
					}),
		};
		const capacityExceeded =
			this._options.isDraining() ||
			this._incoming.size + this._options.retention.incomingCount >=
				RPC_MAX_UNRETIRED_CALLS_PER_DIRECTION;
		const reservation = capacityExceeded
			? undefined
			: this._options.reserveRetainedBytes(
					request.args.weight +
						(request.metadata?.weight ?? 0) +
						RPC_ENTRY_OVERHEAD_BYTES,
				);
		if (reservation === undefined) {
			this._queueProtected(
				createStreamError(message.streamId, RpcExceptionCodeEnum.unavailable),
			);
			return;
		}
		const entry: IRpcIncomingStream = {
			streamId: message.streamId,
			reservation,
			terminal: false,
		};
		this._incoming.set(entry.streamId, entry);
		const observer: IRpcProtocolStreamObserver = {
			next: (value) => {
				if (entry.terminal || this._closed) return;
				const replay = this._options.retention.reserveReplay(
					Object.freeze({
						kind: RpcWireRecordKindEnum.streamNext,
						streamId: entry.streamId,
						value: value.value,
					}),
				);
				if (replay === undefined)
					this._finishIncoming(entry, RpcExceptionCodeEnum.unavailable);
				else this._options.delivery.queueReplay(replay);
			},
			complete: () => this._finishIncoming(entry),
			error: (code) =>
				this._finishIncoming(
					entry,
					code === RpcExceptionCodeEnum.outcomeUnknown
						? RpcExceptionCodeEnum.handlerFailed
						: code,
				),
		};
		try {
			entry.handle = this._options
				.getHost()
				?.openIncomingStream?.(request, observer);
			if (entry.handle === undefined && !entry.terminal)
				this._finishIncoming(entry, RpcExceptionCodeEnum.unavailable);
			else if (entry.terminal) {
				const handle = entry.handle;
				entry.handle = undefined;
				handle?.finish(entry.code);
			}
		} catch {
			this._finishIncoming(entry, RpcExceptionCodeEnum.handlerFailed);
		}
	}

	_finishIncoming(entry: IRpcIncomingStream, code?: RpcCallFailure): void {
		if (entry.terminal || this._closed) return;
		entry.terminal = true;
		entry.code = code;
		const message =
			code === undefined
				? Object.freeze({
						kind: RpcWireRecordKindEnum.streamComplete,
						streamId: entry.streamId,
					})
				: createStreamError(entry.streamId, code as RpcWireErrorCode);
		const replay = this._options.retention.reserveReplay(
			message,
			undefined,
			() => {
				this._incoming.delete(entry.streamId);
				entry.reservation.release();
				this._options.onRetired();
			},
		);
		const handle = entry.handle;
		entry.handle = undefined;
		handle?.finish(code);
		if (replay === undefined)
			this._options.onFault(
				new Error("RPC protected stream terminal reserve is exhausted."),
			);
		else this._options.delivery.queueReplay(replay);
		this._options.onRetired();
	}

	_finishOutgoing(entry: IRpcOutgoingStream, code?: RpcCallFailure): void {
		if (entry.terminal) return;
		entry.terminal = true;
		this._outgoing.delete(entry);
		entry.withdraw?.();
		entry.withdraw = undefined;
		entry.request = undefined;
		this._releasePending(entry);
		if (code === undefined) entry.observer.complete();
		else entry.observer.error(code);
		this._options.onRetired();
	}

	_queueProtected(message: RpcStreamSemanticMessage): void {
		if (!this._options.delivery.queueSemantic(Object.freeze(message)))
			this._options.onFault(
				new Error("RPC protected stream control reserve is exhausted."),
			);
	}
}

interface IRpcOutgoingStream {
	readonly observer: IRpcProtocolStreamObserver;
	readonly pendingCharge: number;
	request?: IRpcProtocolCallRequest;
	reservation?: IRpcRetainedBytesReservation;
	withdraw?: () => void;
	started: boolean;
	streamId?: string;
	admitted: boolean;
	terminal: boolean;
}

interface IRpcIncomingStream {
	readonly streamId: string;
	readonly reservation: IRpcRetainedBytesReservation;
	handle?: IRpcProtocolIncomingStream;
	terminal: boolean;
	code?: RpcCallFailure;
}

function createStreamError(streamId: string, code: RpcWireErrorCode) {
	return Object.freeze({
		kind: RpcWireRecordKindEnum.streamError,
		streamId,
		error: Object.freeze({
			code,
			message: `Remote stream failed with code ${code}.`,
		}),
	});
}
