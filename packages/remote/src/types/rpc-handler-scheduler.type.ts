/**
 * @overview Private incoming-handler scheduler job type.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

export type RpcHandlerJob = (releasePermit: () => void) => boolean;
