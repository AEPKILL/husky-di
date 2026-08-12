/**
 * @overview PROTOTYPE ONLY — functional-seams caller usage.
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import { ISession, remoteSessionOptions, sessionService } from "./fixtures";
import { FunctionalSeams } from "./public-interface";

/** ALTERNATIVE C — FUNCTIONAL / EXPLICIT SEAMS */
export async function functionalSeamsUsage(
	connectorAdapter: FunctionalSeams.RpcConnectorAdapter,
	acceptorAdapter: FunctionalSeams.RpcAcceptorAdapter,
): Promise<void> {
	const remoteSession = FunctionalSeams.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
	const exposure = FunctionalSeams.createRpcExposure();
	const unexpose = FunctionalSeams.exposeRemote(
		exposure,
		remoteSession,
		sessionService,
	);
	const connector = FunctionalSeams.createRpcConnector({
		adapter: connectorAdapter,
		exposure,
	});
	const session = FunctionalSeams.resolveRemote(connector.peer, remoteSession);
	const acceptor = FunctionalSeams.createRpcAcceptor({
		adapter: acceptorAdapter,
		exposure,
	});

	try {
		await connector.connect();
		await session.ping();
		await acceptor.listen();
	} finally {
		unexpose();
		connector.dispose();
		acceptor.dispose();
		exposure.dispose();
	}
}
