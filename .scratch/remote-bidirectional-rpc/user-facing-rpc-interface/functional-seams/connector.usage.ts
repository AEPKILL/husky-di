/**
 * @overview 仅供原型验证——函数式接缝方案的 Connector 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { FunctionalSeams } from "../public-interface";
import { remoteSession } from "./remote-services";

/** 备选方案 C——函数式／显式接缝的主动拓扑 */
export async function functionalSeamsConnectorUsage(
	adapter: FunctionalSeams.RpcConnectorAdapter,
): Promise<void> {
	const exposure = FunctionalSeams.createRpcExposure();

	try {
		await runFunctionalSeamsConnector(adapter, exposure);
	} finally {
		exposure.dispose();
	}
}

/** 使用调用方拥有的 exposure 运行主动 topology。 */
export async function runFunctionalSeamsConnector(
	adapter: FunctionalSeams.RpcConnectorAdapter,
	exposure: FunctionalSeams.IRpcExposure,
): Promise<void> {
	const connector = FunctionalSeams.createRpcConnector({ adapter, exposure });

	try {
		const session = FunctionalSeams.resolveRemote(
			connector.peer,
			remoteSession,
		);
		await connector.connect();
		await session.ping();
	} finally {
		connector.dispose();
	}
}
