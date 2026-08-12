/**
 * @overview PROTOTYPE ONLY — contract-centered caller usage.
 *
 * @author AEPKILL
 * @created 2026-08-12 23:20:00
 */

import { ISession, remoteSessionOptions, sessionService } from "./fixtures";
import { ContractCentered } from "./public-interface";

/**
 * ALTERNATIVE B — CONTRACT-CENTERED
 *
 * The same task gains descriptor facade methods, a binding object and a
 * separately-owned services catalog.
 */
export async function contractCenteredUsage(
	connectorAdapter: ContractCentered.RpcConnectorAdapter,
	acceptorAdapter: ContractCentered.RpcAcceptorAdapter,
): Promise<void> {
	const remoteSession = ContractCentered.createRemoteContract(
		ISession,
		remoteSessionOptions,
	);
	const services = ContractCentered.createRpcServices();
	const unexpose = services.add(remoteSession.provide(sessionService));
	const connector = ContractCentered.createRpcConnector({
		adapter: connectorAdapter,
		services,
	});

	const session = remoteSession.from(connector.peer);
	const acceptor = ContractCentered.createRpcAcceptor({
		adapter: acceptorAdapter,
		services,
	});

	try {
		await connector.connect();
		await session.login("alice", "secret", new AbortController().signal);
		await acceptor.listen();
	} finally {
		connector.dispose();
		acceptor.dispose();
		unexpose();
		services.dispose();
	}
}
