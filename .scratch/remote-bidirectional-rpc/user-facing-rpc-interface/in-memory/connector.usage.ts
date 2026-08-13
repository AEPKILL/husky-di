/**
 * @overview 仅供原型验证——内存 adapter 的 Connector 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:20:00
 */

import { RootCentered } from "../public-interface";
import { RemoteSession } from "./remote-services";

export async function inMemoryConnectorUsage(
	adapter: RootCentered.RpcConnectorAdapter,
): Promise<void> {
	const rpc = RootCentered.createRpc();
	const connector = rpc.connector(adapter);
	const session = connector.peer.resolve(RemoteSession);

	try {
		await connector.connect();
		await session.ping();
	} finally {
		rpc.dispose();
	}
}
