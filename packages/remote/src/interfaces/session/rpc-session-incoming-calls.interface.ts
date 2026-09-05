/**
 * @overview Private ownership of incoming Call Ordinals, scoped admission, and terminal publication.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type {
	IRpcProtocolHost,
	IRpcProtocolSessionHost,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	IRpcReplayReservation,
	IRpcSessionCallRetention,
} from "@/interfaces/session/rpc-session-call-retention.interface";
import type { RpcCallMessage } from "@/types/protocol/rpc-wire-record.type";

/** Owns incoming work for the full Session Incarnation, across binding replacement. */
export interface IRpcSessionIncomingCalls {
	readonly hasActive: boolean;
	/** Accepts a sequence-validated call using the Session's current drain cutoff. */
	receiveCall(message: RpcCallMessage): void;
	receiveCancel(callId: string): void;
	/** Terminalizes Framework work synchronously; delivery retains its replay custody. */
	terminate(): void;
}

export type RpcSessionIncomingCallsFactory = (options: {
	readonly retention: Pick<
		IRpcSessionCallRetention,
		| "incomingCount"
		| "hasActiveIncoming"
		| "retainIncoming"
		| "rejectIncoming"
		| "cancelIncoming"
		| "reserveReplay"
		| "terminateIncoming"
	>;
	readonly normalizeApplicationArguments: IRpcProtocolHost["normalizeApplicationArguments"];
	/** Read after normalization so reentrant shutdown preserves the admission cutoff. */
	readonly isDraining: () => boolean;
	readonly reserveIncomingCall: IRpcProtocolSessionHost["reserveIncomingCall"];
	/** Transfers the selected terminal's replay custody synchronously to delivery. */
	readonly onTerminal: (replay: IRpcReplayReservation) => void;
	readonly onFault: (error: Error) => void;
}) => IRpcSessionIncomingCalls;
