/**
 * @overview Private committed RPC Peer invocation contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

export interface IRpcPeerCommittedInvocation {
	readonly result: Promise<unknown>;
	start(): void;
	cancel(): void;
}
