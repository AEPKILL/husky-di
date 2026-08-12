/**
 * @overview PROTOTYPE ONLY — in-memory adapter assembly usage.
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import { ISession, remoteSessionOptions, sessionService } from "./fixtures";
import { createMemoryRpcAdapterPair, RootCentered } from "./public-interface";

export async function inMemoryUsage(): Promise<void> {
	const remoteSession = RootCentered.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
	const adapters = createMemoryRpcAdapterPair();
	const clientRpc = RootCentered.createRpc();
	const serverRpc = RootCentered.createRpc();
	serverRpc.expose(remoteSession, sessionService);

	const acceptor = serverRpc.acceptor(adapters.acceptorAdapter);
	const connector = clientRpc.connector(adapters.connectorAdapter);
	const session = connector.peer.resolve(remoteSession);

	try {
		await acceptor.listen();
		await connector.connect();
		await session.ping();
	} finally {
		clientRpc.dispose();
		serverRpc.dispose();
	}
}
