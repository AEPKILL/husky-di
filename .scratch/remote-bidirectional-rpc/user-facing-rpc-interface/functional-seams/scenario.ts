/**
 * @overview 仅供原型验证——编排共享同一 exposure 的两种 functional topology。
 *
 * 本文件只创建公共 owner 并组合两侧高层 usage，不直接调用 Connector 或 Acceptor。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { sessionService } from "../fixtures";
import { FunctionalSeams } from "../public-interface";
import { runFunctionalSeamsAcceptor } from "./acceptor.usage";
import { runFunctionalSeamsConnector } from "./connector.usage";
import { remoteSession } from "./remote-services";

/** 恢复原组合入口，同时让两种 topology 的直接用法留在各自文件中。 */
export async function functionalSeamsUsage(
	connectorAdapter: FunctionalSeams.RpcConnectorAdapter,
	acceptorAdapter: FunctionalSeams.RpcAcceptorAdapter,
): Promise<void> {
	const exposure = FunctionalSeams.createRpcExposure();

	try {
		const unexpose = FunctionalSeams.exposeRemote(
			exposure,
			remoteSession,
			sessionService,
		);

		try {
			await runFunctionalSeamsConnector(connectorAdapter, exposure);
			await runFunctionalSeamsAcceptor(acceptorAdapter, exposure);
		} finally {
			unexpose();
		}
	} finally {
		exposure.dispose();
	}
}
