/**
 * @overview 仅供原型验证——以 RPC 根对象为中心的 Connector 用法。
 *
 * @author AEPKILL
 * @created 2026-08-14 00:12:43
 */

import { clientEvents } from "../fixtures";
import { RootCentered } from "../public-interface";
import { remoteClientEvents, remoteSession } from "./remote-services";

/**
 * 推荐草案——以 RPC 根对象为中心的主动拓扑
 *
 * RPC 根对象拥有本地服务暴露和 Connector；Connector 则拥有稳定的 peer。
 */
export async function activeRootCenteredUsage(
	adapter: RootCentered.RpcConnectorAdapter,
): Promise<void> {
	const rpc = RootCentered.createRpc();
	const unexpose = rpc.expose(remoteClientEvents, clientEvents);
	const connector = rpc.connector(adapter);
	const session = connector.peer.resolve(remoteSession);

	try {
		await connector.connect();
		await session.ping();

		const controller = new AbortController();
		const pending = session.login("alice", "secret", controller.signal);
		controller.abort();
		try {
			await pending;
		} catch (error) {
			console.warn("Login was canceled", error);
		}
	} finally {
		unexpose();
		connector.dispose();
		rpc.dispose();
	}
}
