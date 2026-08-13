/**
 * @overview 仅供原型验证——函数式接缝方案的 Acceptor 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { sessionService } from "../fixtures";
import { FunctionalSeams } from "../public-interface";
import { remoteSession } from "./remote-services";

/** 备选方案 C——函数式／显式接缝的被动拓扑 */
export async function functionalSeamsAcceptorUsage(
	adapter: FunctionalSeams.RpcAcceptorAdapter,
): Promise<void> {
	const exposure = FunctionalSeams.createRpcExposure();

	try {
		const unexpose = FunctionalSeams.exposeRemote(
			exposure,
			remoteSession,
			sessionService,
		);

		try {
			await runFunctionalSeamsAcceptor(adapter, exposure);
		} finally {
			unexpose();
		}
	} finally {
		exposure.dispose();
	}
}

/** 使用调用方拥有的 exposure 运行被动 topology。 */
export async function runFunctionalSeamsAcceptor(
	adapter: FunctionalSeams.RpcAcceptorAdapter,
	exposure: FunctionalSeams.IRpcExposure,
): Promise<void> {
	const acceptor = FunctionalSeams.createRpcAcceptor({ adapter, exposure });

	try {
		await acceptor.listen();
	} finally {
		acceptor.dispose();
	}
}
