/**
 * @overview Private Topology Owner implementation construction inputs.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type { IRpcRetainedBytesLedger } from "@/interfaces/common/rpc-retained-bytes-ledger.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/owner/rpc-handler-scheduler.interface";
import type { IRpcOwnerCustody } from "@/interfaces/owner/rpc-owner-custody.interface";
import type { IRpcOwnerMutationBatch } from "@/interfaces/owner/rpc-owner-mutation-batch.interface";
import type { RpcPeerFactory } from "@/interfaces/peer/rpc-peer-runtime.interface";
import type {
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type {
	RpcAcceptorState,
	RpcConnectorState,
} from "@/types/common/rpc-caller.type";

export type CreateRpcConnectorImplOptions = CreateRpcOwnerImplOptions &
	Readonly<{
		readonly mutationBatch: IRpcOwnerMutationBatch<RpcConnectorState>;
		readonly runtime: IRpcProtocolConnectorRuntime;
	}>;

export type CreateRpcAcceptorImplOptions = CreateRpcOwnerImplOptions &
	Readonly<{
		readonly mutationBatch: IRpcOwnerMutationBatch<RpcAcceptorState>;
		readonly runtime: IRpcProtocolAcceptorRuntime;
	}>;

type CreateRpcOwnerImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly custody: IRpcOwnerCustody;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createPeer: RpcPeerFactory;
}>;
