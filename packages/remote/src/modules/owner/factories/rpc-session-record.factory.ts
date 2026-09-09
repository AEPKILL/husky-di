/**
 * @overview Assembles stable Peer retention for either Owner role.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import {
	type CreateRpcSessionRecordOptions,
	RpcSessionRecordImpl,
} from "@/modules/owner/impls/rpc-session-record.impl";
import type { IRpcSessionRecord } from "@/modules/owner/interfaces/rpc-session-record.interface";
import type { RpcSessionOwnershipDependencies } from "@/modules/owner/types/rpc-session-ownership.type";

export function createRpcSessionRecord(
	options: CreateRpcSessionRecordOptions,
	dependencies: RpcSessionOwnershipDependencies,
): IRpcSessionRecord {
	return new RpcSessionRecordImpl(options, dependencies);
}
