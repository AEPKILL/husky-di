/**
 * @overview 仅供原型验证——以契约为中心的 Connector 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { ContractCentered } from "../public-interface";
import { remoteSession } from "./remote-services";

/**
 * 备选方案 B——以契约为中心的主动拓扑
 *
 * Connector 借用自己的本地服务目录，远端 contract 负责从 peer 创建 proxy。
 */
export async function contractCenteredConnectorUsage(
	adapter: ContractCentered.RpcConnectorAdapter,
): Promise<void> {
	const services = ContractCentered.createRpcServices();

	try {
		await runContractCenteredConnector(adapter, services);
	} finally {
		services.dispose();
	}
}

/** 使用调用方拥有的服务目录运行主动 topology。 */
export async function runContractCenteredConnector(
	adapter: ContractCentered.RpcConnectorAdapter,
	services: ContractCentered.IRpcServices,
): Promise<void> {
	const connector = ContractCentered.createRpcConnector({ adapter, services });

	try {
		const session = remoteSession.from(connector.peer);
		await connector.connect();
		await session.login("alice", "secret", new AbortController().signal);
	} finally {
		connector.dispose();
	}
}
