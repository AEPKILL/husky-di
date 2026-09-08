/**
 * @overview Framework callbacks for Connector Session lifecycle attachment and owner faults.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type {
	IRpcProtocolSessionLifecycle,
	IRpcProtocolSessionLifecycleHost,
} from "@/modules/protocol/interfaces/rpc-protocol-session-lifecycle.interface";
import type { RpcProtocolFaultReason } from "@/modules/protocol/types/rpc-outcome.type";

/** Lifecycle-only host; acceptance does not grant RPC call capabilities. */
export interface IRpcProtocolConnectorLifecycleHost {
	/** Offers a fresh Session; Recovery reuses the retained host instead. */
	attachSession(
		session: IRpcProtocolSessionLifecycle,
	): IRpcProtocolSessionLifecycleHost | undefined;
	fault(reason: RpcProtocolFaultReason, error: Error): void;
}
