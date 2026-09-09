/**
 * @overview Assembles a private RPC Peer host using implementation-owned construction options.
 * @author AEPKILL
 * @created 2026-09-04 00:00:00
 */

import {
	type CreateRpcPeerOptions,
	RpcPeerImpl,
} from "@/modules/peer/impls/rpc-peer.impl";
import { RpcPeerIncomingCallsImpl } from "@/modules/peer/impls/rpc-peer-incoming-calls.impl";
import { RpcPeerOutgoingCallsImpl } from "@/modules/peer/impls/rpc-peer-outgoing-calls.impl";
import type { IRpcPeerHost } from "@/modules/peer/interfaces/rpc-peer-host.interface";

/** Creates a stable Peer behind the private Protocol host contract. */
export function createRpcPeer(options: CreateRpcPeerOptions): IRpcPeerHost {
	const peer = new RpcPeerImpl(options, (lifecycleOptions) => {
		const outgoing = new RpcPeerOutgoingCallsImpl(lifecycleOptions);
		const incoming = new RpcPeerIncomingCallsImpl(lifecycleOptions);
		return Object.freeze({
			invoke: outgoing.invoke.bind(outgoing),
			reserveIncomingCall: incoming.reserveIncomingCall.bind(incoming),
		});
	});
	return Object.freeze<IRpcPeerHost>({
		peer,
		reserveIncomingCall: (request, consume) =>
			peer.reserveIncomingCall(request, consume),
		hasLocalExposure: (wireName) => peer.hasLocalExposure(wireName),
	});
}
