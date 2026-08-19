/**
 * @overview Public RPC Exception branch codes.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type { RpcCallFailure } from "@/interfaces/protocol/rpc-protocol.interface";

export type RpcExceptionCode = RpcCallFailure | "protocol";
