/**
 * @overview Routes retained-byte reservations through a built-in Session when available.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
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
