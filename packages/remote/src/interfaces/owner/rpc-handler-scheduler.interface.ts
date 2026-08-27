/**
 * @overview Private Topology Owner incoming-handler scheduling contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { RpcHandlerJob } from "@/types/rpc-handler-scheduler.type";

export interface IRpcHandlerScheduler {
	enqueue(session: object, job: RpcHandlerJob): () => void;
}
