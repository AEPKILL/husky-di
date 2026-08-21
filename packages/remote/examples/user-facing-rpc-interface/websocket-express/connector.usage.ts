/**
 * @overview Browser Connector common path for the RPC Interface throwaway prototype.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import type { Cleanup } from "@husky-di/core";
import {
	createRpcConnector,
	type IRpcConnectorAdapter,
} from "@husky-di/remote";
import { createBrowserWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { filter, firstValueFrom, type Subscription, take } from "rxjs";

import { clientEvents } from "../fixtures";
import { remoteClientEvents, remoteSession } from "./remote-services";

export async function browserConnectorUsage(
	url = "wss://example.test/rpc",
): Promise<void> {
	const connector = createRpcConnector();

	let stopExposure: Cleanup | undefined;
	let observations: Subscription | undefined;
	try {
		stopExposure = connector.peer.expose(remoteClientEvents, clientEvents);
		const session = connector.peer.resolve(remoteSession);
		observations = connector.event$.subscribe(reportRpcEvent);
		const recoveryRequested = firstValueFrom(
			connector.event$.pipe(
				filter((event) => event.type === "peer-recovering"),
				take(1),
			),
		);
		await connector.connect({ adapter: createExampleConnectorAdapter(url) });
		const pendingPing = session.ping();

		// The caller selects a fresh Adapter after observing an interruption. The
		// original peer, proxy, exposure, and pending call survive this replacement.
		await recoveryRequested;
		await connector.connect({ adapter: createExampleConnectorAdapter(url) });
		await pendingPing;
		await session.ping();
	} finally {
		stopExposure?.();
		try {
			await connector.close();
		} finally {
			observations?.unsubscribe();
		}
	}
}

function createExampleConnectorAdapter(url: string): IRpcConnectorAdapter {
	return createBrowserWebSocketConnectorAdapter({
		url,
		maxInboundMessages: 64,
		maxInboundBytes: 4 << 20,
		maxOutboundBufferedBytes: 1 << 20,
	});
}

function reportRpcEvent(event: unknown): void {
	console.debug("RPC event", event);
}
