/**
 * @overview Narrow Protocol Session termination and Framework lifecycle notification contracts.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { RpcProtocolFaultReason } from "@/modules/protocol/types/rpc-outcome.type";
import type { RpcProtocolSessionTransition } from "@/modules/protocol/types/rpc-protocol-session-transition.type";

/** Session termination capability; it does not provide invocation or admission. */
export interface IRpcProtocolSessionLifecycle {
	/** Synchronously terminates this Session before the Framework publishes its terminal state. */
	forceClose(): void;
}

/** Notifications scoped to the exact attached Session, including across Recovery. */
export interface IRpcProtocolSessionLifecycleHost {
	transition(transition: RpcProtocolSessionTransition): void;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}
