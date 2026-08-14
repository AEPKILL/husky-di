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
import { createRpcAcceptor, RpcBatchResultStatusEnum } from "../rpc-interface";
import { createWebSocketAcceptorAdapter } from "../websocket-adapters";
import type { IExpressApplication, WebSocketExpressPlatform } from "./platform";
import { remoteClientEvents, remoteSession } from "./remote-services";

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

	const acceptor = createRpcAcceptor({
		adapter: createWebSocketAcceptorAdapter({
			server: httpServer,
			path: "/rpc",
			maxPayloadBytes: 4 << 20,
			maxInboundMessages: 64,
			maxInboundBytes: 4 << 20,
			createWebSocketServer: platform.createWebSocketServer,
		}),
	});
	const stopSessionExposure = acceptor.expose(remoteSession, sessionService);
	const allClientEvents = acceptor.resolveAll(remoteClientEvents);
	const stopNewPeerNotifications = acceptor.onPeer((peer) => {
		void peer
			.resolve(remoteClientEvents)
			.changed("session-opened")
			.catch((error) => {
				console.warn("Could not welcome the new client", error);
			});
	});
	void acceptor.closed.catch(reportAcceptorFailure);

	// listen() 同步挂接 Upgrade 处理，然后等待所借用的 HTTP 服务器就绪。
	// Express middleware 不处理 Upgrade 请求；身份认证被有意排除在该原型之外。
	try {
		const rpcReady = acceptor.listen();
		httpServer.listen(3_000);
		await rpcReady;

		const firstClient = acceptor.peers[0];
		if (firstClient) {
			await firstClient.resolve(remoteClientEvents).changed("server-ready");
		}

		const deliveries = await allClientEvents.changed("maintenance-scheduled");
		for (const delivery of deliveries) {
			if (delivery.status === RpcBatchResultStatusEnum.rejected) {
				console.warn(
					"Client notification failed",
					delivery.peer,
					delivery.reason.code,
				);
			}
		}
	} finally {
		// 应用先移除可撤销注册，再停止 Upgrade 和会话，最后关闭借用的 HTTP server。
		// 适配器绝不会关闭这个服务器。
		stopNewPeerNotifications();
		stopSessionExposure();
		acceptor.dispose();
		httpServer.close();
	}
}

function reportAcceptorFailure(error: unknown): void {
	console.error("RPC acceptor failed", error);
}
