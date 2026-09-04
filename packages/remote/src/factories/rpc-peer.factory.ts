/**
 * @overview Assembles the private RPC Peer host around one caller-visible Peer identity.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import {
	type CreateRpcPeerOptions,
	RpcPeerImpl,
} from "@/impls/peer/rpc-peer.impl";
import type { IRpcPeerHost } from "@/interfaces/peer/rpc-peer-host.interface";

export type { CreateRpcPeerOptions } from "@/impls/peer/rpc-peer.impl";

/** Creates one Peer identity and its focused Owner-facing host. */
export function createRpcPeer(options: CreateRpcPeerOptions): IRpcPeerHost {
	const peer = new RpcPeerImpl(options);
	return Object.freeze({
		peer,
		reserveIncomingCall: (
			request: Parameters<IRpcPeerHost["reserveIncomingCall"]>[0],
			consume: Parameters<IRpcPeerHost["reserveIncomingCall"]>[1],
		) => peer.reserveIncomingCall(request, consume),
		hasLocalExposure: (wireName: string) => peer.hasLocalExposure(wireName),
	});
}
