/**
 * @overview @husky-di/remote 设计示例——浏览器通过 WebSocket 主动连接 RPC。
 *
 * 本文件只展示 Connector 的真实应用装配与调用代码。Connector 负责主动建连；
 * 单个 Logical Session 的 exposure 与 resolution 都位于其稳定 RpcPeer。
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import { clientEvents } from "../fixtures";
import { createRpcConnector } from "../rpc-interface";
import { createBrowserWebSocketConnectorAdapter } from "../websocket-adapters";
import { remoteClientEvents, remoteSession } from "./remote-services";

/** 面向 Express 所托管 `/rpc` 端点的浏览器主动拓扑。 */
export async function browserWebSocketClientUsage(
	url = "wss://example.test/rpc",
): Promise<void> {
	const connector = createRpcConnector({
		adapter: createBrowserWebSocketConnectorAdapter({
			url,
			maxInboundMessages: 64,
			maxInboundBytes: 4 << 20,
			maxOutboundBufferedBytes: 1 << 20,
		}),
	});
	const stopClientEvents = connector.peer.expose(
		remoteClientEvents,
		clientEvents,
	);
	const session = connector.peer.resolve(remoteSession);

	try {
		await connector.connect();
		await session.ping();
	} finally {
		stopClientEvents();
		connector.dispose();
	}
}
