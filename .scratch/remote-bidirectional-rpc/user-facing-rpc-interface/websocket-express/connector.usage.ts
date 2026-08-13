/**
 * @overview 仅供原型验证——浏览器通过 WebSocket 主动连接 RPC 的应用侧用法。
 *
 * 本文件只展示 Connector 的真实应用装配与调用代码。WebSocket 平台兼容实现
 * 保留在同类原型目录之外的 `websocket-adapters.ts` 中。
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import { RootCentered } from "../public-interface";
import { createBrowserWebSocketConnectorAdapter } from "../websocket-adapters";
import { remoteSession } from "./remote-services";

/** 面向 Express 所托管 `/rpc` 端点的浏览器主动拓扑。 */
export async function browserWebSocketClientUsage(
	url = "wss://example.test/rpc",
): Promise<void> {
	const rpc = RootCentered.createRpc();
	const connector = rpc.connector(
		createBrowserWebSocketConnectorAdapter({
			url,
			maxInboundFrames: 64,
			maxInboundBytes: 4 << 20,
			maxOutboundBufferedBytes: 1 << 20,
		}),
	);
	const session = connector.peer.resolve(remoteSession);

	try {
		await connector.connect();
		await session.ping();
	} finally {
		connector.dispose();
		rpc.dispose();
	}
}
