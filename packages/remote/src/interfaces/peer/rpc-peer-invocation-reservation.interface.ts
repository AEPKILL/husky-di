/**
 * @overview Private RPC Peer invocation reservation contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcPeerCommittedInvocation } from "@/interfaces/peer/rpc-peer-committed-invocation.interface";

export interface IRpcPeerInvocationReservation {
	commit(): IRpcPeerCommittedInvocation;
	release(): void;
}
