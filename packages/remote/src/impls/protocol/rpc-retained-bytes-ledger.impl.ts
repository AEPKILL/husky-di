/**
 * @overview Owner and built-in Session retained-byte reservation ledgers.
 * @author AEPKILL
 * @created 2026-08-21 00:00:00
 */

import type {
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
} from "@/interfaces/protocol/rpc-protocol.interface";

type RpcSessionRetainedBytesReserve = (
	bytes: number,
) => IRpcRetainedBytesReservation | undefined;

const sessionRetainedBytesReserves = new WeakMap<
	IRpcProtocolSession,
	RpcSessionRetainedBytesReserve
>();

/** Registers the built-in Session's private aggregate reservation port. */
export function registerRpcSessionRetainedBytes(
	session: IRpcProtocolSession,
	reserve: RpcSessionRetainedBytesReserve,
): void {
	sessionRetainedBytesReserves.set(session, reserve);
}

/** Removes a terminal built-in Session's private aggregate reservation port. */
export function unregisterRpcSessionRetainedBytes(
	session: IRpcProtocolSession,
): void {
	sessionRetainedBytesReserves.delete(session);
}

/** Uses the built-in Session aggregate when present, otherwise the Owner port. */
export function reserveRpcSessionRetainedBytes(
	session: IRpcProtocolSession | undefined,
	reserveOwnerRetainedBytes: (
		bytes: number,
	) => IRpcRetainedBytesReservation | undefined,
	bytes: number,
): IRpcRetainedBytesReservation | undefined {
	const reserveSessionRetainedBytes =
		session === undefined
			? undefined
			: sessionRetainedBytesReserves.get(session);
	if (reserveSessionRetainedBytes !== undefined) {
		return reserveSessionRetainedBytes(bytes);
	}
	return reserveOwnerRetainedBytes(bytes);
}

/** Atomically reserves one Session or Owner aggregate retained-byte allowance. */
export class RpcRetainedBytesLedgerImpl {
	readonly _maximumBytes: number;
	_retainedBytes = 0;

	public constructor(maximumBytes: number) {
		if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
			throw new TypeError(
				"RPC retained-byte maximum must be a positive safe integer.",
			);
		}
		this._maximumBytes = maximumBytes;
	}

	reserve(bytes: number): IRpcRetainedBytesReservation | undefined {
		if (!Number.isSafeInteger(bytes) || bytes < 0) {
			throw new TypeError(
				"RPC retained-byte reservation must be a non-negative safe integer.",
			);
		}
		if (bytes > this._maximumBytes - this._retainedBytes) {
			return undefined;
		}
		this._retainedBytes += bytes;
		let released = false;
		return Object.freeze<IRpcRetainedBytesReservation>({
			release: () => {
				if (released) {
					return;
				}
				released = true;
				this._retainedBytes -= bytes;
			},
		});
	}
}
