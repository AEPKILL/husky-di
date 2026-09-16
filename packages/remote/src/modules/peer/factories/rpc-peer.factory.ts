/**
 * @overview Assembles a private RPC Peer host using implementation-owned construction options.
 * @author AEPKILL
 * @created 2026-09-09 23:33:27
 */

import {
	type CreateRpcPeerOptions,
	RpcPeerImpl,
} from "@/modules/peer/impls/rpc-peer.impl";
import { RpcPeerIncomingCallsImpl } from "@/modules/peer/impls/rpc-peer-incoming-calls.impl";
import { RpcPeerOutgoingCallsImpl } from "@/modules/peer/impls/rpc-peer-outgoing-calls.impl";
import { RpcPeerStreamsImpl } from "@/modules/peer/impls/rpc-peer-streams.impl";
import type { IRpcPeerHost } from "@/modules/peer/interfaces/rpc-peer-host.interface";

/** Creates a stable Peer behind the private Protocol host contract. */
export function createRpcPeer(options: CreateRpcPeerOptions): IRpcPeerHost {
	const peer = new RpcPeerImpl(options, (lifecycleOptions) => {
		const outgoing = new RpcPeerOutgoingCallsImpl(lifecycleOptions);
		const incoming = new RpcPeerIncomingCallsImpl(lifecycleOptions);
		const streams = new RpcPeerStreamsImpl(lifecycleOptions);
		return Object.freeze({
			invoke: outgoing.invoke.bind(outgoing),
			subscribe: streams.subscribe.bind(streams),
			openIncomingStream: streams.openIncomingStream.bind(streams),
			reserveIncomingCall: incoming.reserveIncomingCall.bind(incoming),
		});
	});
	return Object.freeze<IRpcPeerHost>({
		peer,
		openIncomingStream: (request, observer) =>
			peer.openIncomingStream(request, observer),
		reserveIncomingCall: (request, consume) =>
			peer.reserveIncomingCall(request, consume),
		hasLocalExposure: (wireName) => peer.hasLocalExposure(wireName),
	});
}
