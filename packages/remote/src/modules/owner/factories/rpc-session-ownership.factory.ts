/**
 * @overview Assembles private role-specific Session ownership with stable RPC Peer creation.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import {
	type CreateRpcAcceptorSessionOwnershipOptions,
	RpcAcceptorSessionOwnershipImpl,
} from "@/modules/owner/impls/rpc-acceptor-session-ownership.impl";
import {
	type CreateRpcConnectorSessionOwnershipOptions,
	RpcConnectorSessionOwnershipImpl,
} from "@/modules/owner/impls/rpc-connector-session-ownership.impl";
import type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionOwnership,
} from "@/modules/owner/interfaces/rpc-session-ownership.interface";
import { createRpcPeer } from "@/modules/peer";

/** Creates Connector Session ownership with the package's stable Peer host. */
export function createRpcConnectorSessionOwnership(
	options: CreateRpcConnectorSessionOwnershipOptions,
): IRpcConnectorSessionOwnership {
	return new RpcConnectorSessionOwnershipImpl(options, {
		createPeer: createRpcPeer,
	});
}

/** Creates Acceptor Session ownership with the package's stable Peer host. */
export function createRpcAcceptorSessionOwnership(
	options: CreateRpcAcceptorSessionOwnershipOptions,
): IRpcAcceptorSessionOwnership {
	return new RpcAcceptorSessionOwnershipImpl(options, {
		createPeer: createRpcPeer,
	});
}
