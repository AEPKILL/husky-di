/**
 * @overview Private Topology Owner implementation construction inputs.
 * @author AEPKILL
 * @created 2026-08-22 17:54:40
 */

import type {
	IRpcProtocolAcceptorRuntime,
	IRpcProtocolConnectorRuntime,
	IRpcProtocolRuntimePolicy,
} from "@/interfaces/protocol/rpc-protocol.interface";
import type { IRpcRetainedBytesLedger } from "@/interfaces/protocol/rpc-retained-bytes-ledger.interface";
import type { IRpcEventPublisher } from "@/interfaces/rpc-event-publisher.interface";
import type { IRpcHandlerScheduler } from "@/interfaces/rpc-handler-scheduler.interface";
import type { IRpcOwnerCustody } from "@/interfaces/rpc-owner-custody.interface";
import type { RpcPeerFactory } from "@/types/rpc-peer.type";

type CreateRpcOwnerImplOptions = Readonly<{
	readonly policy: IRpcProtocolRuntimePolicy;
	readonly retainedBytesLedger: IRpcRetainedBytesLedger;
	readonly custody: IRpcOwnerCustody;
	readonly eventPublisher: IRpcEventPublisher;
	readonly handlerScheduler: IRpcHandlerScheduler;
	readonly createPeer: RpcPeerFactory;
}>;

export type CreateRpcConnectorImplOptions = CreateRpcOwnerImplOptions &
	Readonly<{
		readonly runtime: IRpcProtocolConnectorRuntime;
	}>;

export type CreateRpcAcceptorImplOptions = CreateRpcOwnerImplOptions &
	Readonly<{
		readonly runtime: IRpcProtocolAcceptorRuntime;
	}>;
