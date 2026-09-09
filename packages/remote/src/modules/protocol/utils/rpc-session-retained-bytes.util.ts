/**
 * @overview Routes retained-byte reservations through a built-in Session when available.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type {
	IRpcProtocolSession,
	IRpcRetainedBytesReservation,
} from "@/modules/protocol/interfaces/rpc-protocol.interface";

import type { IRpcRetainedBytesLedger } from "@/shared/interfaces/rpc-retained-bytes-ledger.interface";

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

/** Acquires Session and Owner capacity atomically and releases both idempotently. */
export function reserveRpcSessionAndOwnerRetainedBytes(
	sessionLedger: IRpcRetainedBytesLedger,
	reserveOwner: RpcSessionRetainedBytesReserve,
	bytes: number,
): IRpcRetainedBytesReservation | undefined {
	const sessionReservation = sessionLedger.reserve(bytes);
	if (sessionReservation === undefined) {
		return undefined;
	}
	let ownerReservationCandidate: IRpcRetainedBytesReservation | undefined;
	try {
		ownerReservationCandidate = reserveOwner(bytes);
	} catch (error) {
		sessionReservation.release();
		throw error;
	}
	if (ownerReservationCandidate === undefined) {
		sessionReservation.release();
		return undefined;
	}
	const ownerReservation = ownerReservationCandidate;
	let released = false;
	return Object.freeze<IRpcRetainedBytesReservation>({
		release: () => {
			if (released) {
				return;
			}
			released = true;
			sessionReservation.release();
			ownerReservation.release();
		},
	});
}

type RpcSessionRetainedBytesReserve = (
	bytes: number,
) => IRpcRetainedBytesReservation | undefined;

const sessionRetainedBytesReserves = new WeakMap<
	IRpcProtocolSession,
	RpcSessionRetainedBytesReserve
>();
