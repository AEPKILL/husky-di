/**
 * @overview @husky-di/remote 设计示例——Express、Node HTTP 与 `ws` 的平台兼容层。
 *
 * 这里集中放置平台结构类型和不可避免的 `ws` 桥接代码，避免这些细节泄漏到
 * 应用侧的 RPC 使用示例中。
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import type {
	CreateNodeWebSocketServer,
	IHttpServer,
	INodeWebSocket,
	INodeWebSocketServer,
	INodeWebSocketServerOptions,
	NodeErrorListener,
} from "../websocket-adapters";

export interface IExpressResponse {
	sendStatus(status: number): void;
}

export interface IExpressApplication {
	get(
		path: string,
		handler: (request: object, response: IExpressResponse) => void,
	): void;
}

export interface IExpressHttpServer extends IHttpServer {
	listen(port: number): this;
	close(callback?: (error?: Error) => void): this;
}

export interface WebSocketExpressPlatform<
	TApplication extends IExpressApplication,
> {
	readonly express: () => TApplication;
	readonly createHttpServer: (application: TApplication) => IExpressHttpServer;
	readonly createWebSocketServer: CreateNodeWebSocketServer;
}

/** 对应 `import { WebSocketServer } from "ws"` 的准确粘合层。 */
export interface IWsModule {
	readonly createNoServerWebSocketServer: CreateWsNoServer;
}

export type CreateWsNoServer = (
	options: INodeWebSocketServerOptions,
) => IWsWebSocketServer;

export interface IWsWebSocketServer {
	addErrorListener(listener: NodeErrorListener): void;
	removeErrorListener(listener: NodeErrorListener): void;
	handleRpcUpgrade(
		request: Parameters<INodeWebSocketServer["handleUpgrade"]>[0],
		socket: Parameters<INodeWebSocketServer["handleUpgrade"]>[1],
		head: Parameters<INodeWebSocketServer["handleUpgrade"]>[2],
		complete: (webSocket: INodeWebSocket) => void,
	): void;
	close(callback?: (error?: Error) => void): void;
}

/**
 * 真实的 `ws` 装配在此边界负责不可避免的 Node 类型适配：
 *
 * `createWsServerFactory({ createNoServerWebSocketServer: (options) => {
 *   const server = new WebSocketServer(options);
 *   return {
 *     addErrorListener: (listener) => server.on("error", listener),
 *     removeErrorListener: (listener) => server.off("error", listener),
 *     handleRpcUpgrade: (request, socket, head, done) =>
 *       server.handleUpgrade(request as IncomingMessage, socket as Duplex,
 *         Buffer.from(head), (client) => done(client)),
 *     close: (callback) => server.close(callback),
 *   };
 * } })`
 *
 * 该桥接层应与具体的 `ws` 依赖放在一起。它所需的 Node import 不会泄漏到
 * 应用侧代码中，也没有隐藏任何 RPC 行为。
 */
export function createWsServerFactory(
	ws: IWsModule,
): CreateNodeWebSocketServer {
	return (options) => {
		const server = ws.createNoServerWebSocketServer(options);
		return {
			on(_event, listener) {
				server.addErrorListener(listener);
				return this;
			},
			off(_event, listener) {
				server.removeErrorListener(listener);
				return this;
			},
			handleUpgrade(request, socket, head, complete) {
				server.handleRpcUpgrade(request, socket, head, complete);
			},
			close(callback) {
				server.close(callback);
			},
		};
	};
}
