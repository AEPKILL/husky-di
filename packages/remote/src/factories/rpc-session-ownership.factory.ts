/**
 * @overview Assembles private role-specific Session ownership with stable RPC Peer creation.
 * @author AEPKILL
 * @created 2026-09-05 00:00:00
 */

import { createRpcPeer } from "@/factories/rpc-peer.factory";
import {
	type CreateRpcAcceptorSessionOwnershipOptions,
	type CreateRpcConnectorSessionOwnershipOptions,
	RpcAcceptorSessionOwnershipImpl,
	RpcConnectorSessionOwnershipImpl,
} from "@/impls/owner/rpc-session-ownership.impl";
import type {
	IRpcAcceptorSessionOwnership,
	IRpcConnectorSessionOwnership,
} from "@/interfaces/owner/rpc-session-ownership.interface";

export type RpcConnectorSessionOwnershipFactory = (
	options: CreateRpcConnectorSessionOwnershipOptions,
) => IRpcConnectorSessionOwnership;

export type RpcAcceptorSessionOwnershipFactory = (
	options: CreateRpcAcceptorSessionOwnershipOptions,
) => IRpcAcceptorSessionOwnership;

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
