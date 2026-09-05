/**
 * @overview Assembles a private RPC Peer host using implementation-owned construction options.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import {
	type CreateRpcPeerOptions,
	RpcPeerImpl,
} from "@/impls/peer/rpc-peer.impl";
import type { IRpcPeerHost } from "@/interfaces/peer/rpc-peer-host.interface";

export type RpcPeerFactory = (options: CreateRpcPeerOptions) => IRpcPeerHost;

/** Creates a stable Peer behind the private Protocol host contract. */
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
