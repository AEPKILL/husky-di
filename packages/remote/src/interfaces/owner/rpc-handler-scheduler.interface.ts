/**
 * @overview Private Topology Owner incoming-handler scheduling contract.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

/** Starts synchronously and returns a total Framework-owned native settlement. */
export type RpcHandlerJob = () => Promise<void>;

export interface IRpcHandlerScheduler {
	enqueue(session: object, job: RpcHandlerJob): () => void;
}
