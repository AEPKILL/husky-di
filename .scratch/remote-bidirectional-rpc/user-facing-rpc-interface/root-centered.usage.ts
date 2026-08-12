/**
 * @overview PROTOTYPE ONLY — root-centered caller usage.
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import {
	clientEvents,
	IClientEvents,
	ISession,
	remoteClientEventsOptions,
	remoteSessionOptions,
	sessionService,
} from "./fixtures";
import { RootCentered, RpcBatchResultStatusEnum } from "./public-interface";

/**
 * RECOMMENDED DRAFT — ROOT-CENTERED
 *
 * One RPC root owns exposure and active/passive topologies. Method metadata is
 * a per-method map; `true` is unary/noncancelable shorthand for one method.
 */
export async function activeRootCenteredUsage(
	adapter: RootCentered.RpcConnectorAdapter,
): Promise<void> {
	const remoteSession = RootCentered.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
	const remoteClientEvents = RootCentered.createRemoteServiceIdentifier(
		IClientEvents,
		remoteClientEventsOptions,
	);
	const rpc = RootCentered.createRpc();
	const unexpose = rpc.expose(remoteClientEvents, clientEvents);
	const connector = rpc.connector(adapter);
	const session = connector.peer.resolve(remoteSession);

	try {
		await connector.connect();
		await session.ping();

		const controller = new AbortController();
		const pending = session.login("alice", "secret", controller.signal);
		controller.abort();
		try {
			await pending;
		} catch (error) {
			console.warn("Login was canceled", error);
		}
	} finally {
		unexpose();
		connector.dispose();
		rpc.dispose();
	}
}

export async function passiveRootCenteredUsage(
	adapter: RootCentered.RpcAcceptorAdapter,
): Promise<void> {
	const remoteSession = RootCentered.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
	const remoteClientEvents = RootCentered.createRemoteServiceIdentifier(
		IClientEvents,
		remoteClientEventsOptions,
	);
	const rpc = RootCentered.createRpc();
	rpc.expose(remoteSession, sessionService);
	const acceptor = rpc.acceptor(adapter);
	const allClients = acceptor.resolveAll(remoteClientEvents);
	const offPeer = acceptor.onPeer((peer) => {
		void peer.resolve(remoteClientEvents).changed("welcome");
	});

	try {
		await acceptor.listen();

		const oneClient = acceptor.peers[0];
		if (oneClient) {
			await oneClient.resolve(remoteClientEvents).changed("one");
		}

		const results = await allClients.changed("all");
		for (const result of results) {
			if (result.status === RpcBatchResultStatusEnum.fulfilled) {
				console.log(result.peer, result.value);
			} else {
				console.warn(result.peer, result.reason.code);
			}
		}
	} finally {
		offPeer();
		acceptor.dispose();
		rpc.dispose();
	}
}
