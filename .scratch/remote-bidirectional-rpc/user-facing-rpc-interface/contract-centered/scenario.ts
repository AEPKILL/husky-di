/**
 * @overview 仅供原型验证——编排共享同一服务目录的两种 contract-centered topology。
 *
 * 本文件只创建公共 owner 并组合两侧高层 usage，不直接调用 Connector 或 Acceptor。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { sessionService } from "../fixtures";
import { ContractCentered } from "../public-interface";
import { runContractCenteredAcceptor } from "./acceptor.usage";
import { runContractCenteredConnector } from "./connector.usage";
import { remoteSession } from "./remote-services";

/** 恢复原组合入口，同时让两种 topology 的直接用法留在各自文件中。 */
export async function contractCenteredUsage(
	connectorAdapter: ContractCentered.RpcConnectorAdapter,
	acceptorAdapter: ContractCentered.RpcAcceptorAdapter,
): Promise<void> {
	const services = ContractCentered.createRpcServices();

	try {
		const unexpose = services.add(remoteSession.provide(sessionService));

		try {
			await runContractCenteredConnector(connectorAdapter, services);
			await runContractCenteredAcceptor(acceptorAdapter, services);
		} finally {
			unexpose();
		}
	} finally {
		services.dispose();
	}
}
