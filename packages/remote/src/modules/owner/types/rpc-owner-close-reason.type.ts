/**
 * @overview Termination reasons selected by the RPC Topology Owner.
 * @author AEPKILL
 * @created 2026-09-08 00:00:00
 */

import type { RpcCloseReasonEnum } from "@/shared/enums/rpc-close-reason.enum";

export type RpcOwnerCloseReason =
	| RpcCloseReasonEnum.gracefulShutdown
	| RpcCloseReasonEnum.forcedClose
	| RpcCloseReasonEnum.shutdownDeadline;
