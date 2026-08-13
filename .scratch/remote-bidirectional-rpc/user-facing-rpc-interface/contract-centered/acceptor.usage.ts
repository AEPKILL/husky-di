/**
 * @overview 仅供原型验证——以契约为中心的 Acceptor 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { sessionService } from "../fixtures";
import { ContractCentered } from "../public-interface";
import { remoteSession } from "./remote-services";

/**
 * 备选方案 B——以契约为中心的被动拓扑
 *
 * 服务目录拥有本地 exposure；Acceptor 只借用该目录并管理被动 topology。
 */
export async function contractCenteredAcceptorUsage(
	adapter: ContractCentered.RpcAcceptorAdapter,
): Promise<void> {
	const services = ContractCentered.createRpcServices();

	try {
		const unexpose = services.add(remoteSession.provide(sessionService));

		try {
			await runContractCenteredAcceptor(adapter, services);
		} finally {
			unexpose();
		}
	} finally {
		services.dispose();
	}
}

/** 使用调用方拥有的服务目录运行被动 topology。 */
export async function runContractCenteredAcceptor(
	adapter: ContractCentered.RpcAcceptorAdapter,
	services: ContractCentered.IRpcServices,
): Promise<void> {
	const acceptor = ContractCentered.createRpcAcceptor({ adapter, services });

	try {
		await acceptor.listen();
	} finally {
		acceptor.dispose();
	}
}
