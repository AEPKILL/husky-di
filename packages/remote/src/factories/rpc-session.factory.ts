/**
 * @overview Private Logical Session creator contract using implementation-owned construction options.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import type { CreateRpcSessionOptions } from "@/impls/session/rpc-session.impl";
import type { IRpcSession } from "@/interfaces/session/rpc-session.interface";

export type RpcSessionFactory = (
	options: CreateRpcSessionOptions,
) => IRpcSession;
