/**
 * @overview Guards Session capabilities and contains best-effort close effects.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { IRpcSessionRecord } from "@/modules/owner/interfaces/rpc-session-record.interface";
import type { IRpcProtocolSession } from "@/modules/protocol";
import { isCallable, isNonNullObject } from "@/shared/utils/type-guard.util";

export function closeProtocol(protocol: { close(): void }): void {
	try {
		protocol.close();
	} catch {
		// The initiating fault or Owner close remains authoritative.
	}
}

export function forceSession(session: IRpcProtocolSession): void {
	try {
		session.forceClose();
	} catch {
		// The initiating fault or Owner close remains authoritative.
	}
}

export function isProtocolSession(
	value: unknown,
): value is IRpcProtocolSession {
	if (!isNonNullObject(value)) {
		return false;
	}
	const session = value as object;
	return (
		isCallable(Reflect.get(session, "prepareInvocation")) &&
		isCallable(Reflect.get(session, "forceClose"))
	);
}

/** Fences the current membership snapshot before any terminal effects run. */
export function fenceRpcSessions(
	records: Iterable<IRpcSessionRecord>,
): Array<() => void> {
	return Array.from(records).flatMap((record) => {
		const session = record.session;
		const release = session === undefined ? undefined : record.fence(session);
		return release === undefined ? [] : [release];
	});
}
