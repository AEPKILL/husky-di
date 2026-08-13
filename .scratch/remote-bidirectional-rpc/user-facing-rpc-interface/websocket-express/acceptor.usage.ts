/**
 * @overview 仅供原型验证——WebSocket RPC 与 Express 共享 HTTP 服务器的应用侧用法。
 *
 * 本文件只展示 Acceptor 的真实应用装配与调用代码。Express、Node HTTP 与 `ws`
 * 的平台兼容细节集中在同目录的 `platform.ts`。
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import { sessionService } from "../fixtures";
import { RootCentered } from "../public-interface";
import { createWebSocketAcceptorAdapter } from "../websocket-adapters";
import type { IExpressApplication, WebSocketExpressPlatform } from "./platform";
import { remoteSession } from "./remote-services";

/**
 * Express 继续处理普通 HTTP 请求。WebSocket 适配器借用同一个服务器，
 * 且只处理 `/rpc` 的 Upgrade 请求。
 */
export async function webSocketExpressServerUsage<
	TApplication extends IExpressApplication,
>(platform: WebSocketExpressPlatform<TApplication>): Promise<void> {
	const app = platform.express();
	app.get("/health", (_request, response) => response.sendStatus(204));
	const httpServer = platform.createHttpServer(app);

	const rpc = RootCentered.createRpc();
	rpc.expose(remoteSession, sessionService);
	const acceptor = rpc.acceptor(
		createWebSocketAcceptorAdapter({
			server: httpServer,
			path: "/rpc",
			maxPayloadBytes: 4 << 20,
			maxInboundFrames: 64,
			maxInboundBytes: 4 << 20,
			createWebSocketServer: platform.createWebSocketServer,
		}),
	);

	// listen() 同步挂接 Upgrade 处理，然后等待所借用的 HTTP 服务器就绪。
	// Express middleware 不处理 Upgrade 请求；身份认证被有意排除在该原型之外。
	try {
		const rpcReady = acceptor.listen();
		httpServer.listen(3_000);
		await rpcReady;
	} finally {
		// 应用的关闭顺序：先停止 Upgrade，再释放会话，最后由应用关闭 HTTP。
		// 适配器绝不会关闭这个服务器。
		acceptor.dispose();
		rpc.dispose();
		httpServer.close();
	}
}
