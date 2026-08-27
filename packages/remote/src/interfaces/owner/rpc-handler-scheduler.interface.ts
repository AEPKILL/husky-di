/**
 * @overview Private Topology Owner incoming-handler scheduling contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

export type RpcHandlerJob = (releasePermit: () => void) => boolean;

export interface IRpcHandlerScheduler {
	enqueue(session: object, job: RpcHandlerJob): () => void;
}
