/**
 * @overview Node HTTP Acceptor common path for the RPC Interface throwaway prototype.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { Server } from "node:http";

import type { Cleanup } from "@husky-di/core";
import { createRpcAcceptor, type IRpcPeer } from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket";
import type { Subscription } from "rxjs";

import { sessionService } from "../fixtures";
import { remoteClientEvents, remoteSession } from "./remote-services";

export async function nodeAcceptorUsage(httpServer: Server): Promise<void> {
	const acceptor = createRpcAcceptor();

	let stopExposure: Cleanup | undefined;
	let observations: Subscription | undefined;
	try {
		stopExposure = acceptor.expose(remoteSession, sessionService);
		const clients = acceptor.resolveAll(remoteClientEvents);
		const currentPeers = new Set<IRpcPeer>();
		observations = acceptor.event$.subscribe({
			next(event) {
				if (event.type === "peer-opened") {
					currentPeers.add(event.peer);
					void event.peer
						.resolve(remoteClientEvents)
						.changed("session-opened")
						.catch(reportFailure);
				} else if (event.type === "peer-closed") {
					currentPeers.delete(event.peer);
				} else if (
					event.type === "topology-closed" &&
					event.outcome === "failed"
				) {
					reportFailure(event.error);
				}
			},
		});
		// Subscribe first, then merge the snapshot by stable peer identity.
		for (const peer of acceptor.peers) {
			currentPeers.add(peer);
		}

		await acceptor.listen(
			createNodeWebSocketAcceptorAdapter({
				server: httpServer,
				path: "/rpc",
				maxPayloadBytes: 4 << 20,
				maxInboundMessages: 64,
				maxInboundBytes: 4 << 20,
			}),
		);
		const deliveries = await clients.changed("maintenance-scheduled");

		for (const delivery of deliveries) {
			if (delivery.status === "rejected") {
				console.warn(
					"Client event failed",
					delivery.peer,
					delivery.reason.code,
				);
			}
		}
	} finally {
		stopExposure?.();
		try {
			await acceptor.close();
		} finally {
			observations?.unsubscribe();
		}
	}
}

function reportFailure(error: unknown): void {
	console.error("RPC failure", error);
}
