/**
 * @overview PROTOTYPE ONLY — WebSocket RPC sharing an HTTP server with Express.
 *
 * Express and `ws` are constructor-injected structural dependencies because
 * this repository does not directly depend on either package. A real caller
 * passes a configured Express application, its shared HTTP server, and the
 * small `ws` bridge shown below.
 *
 * @author AEPKILL
 * @created 2026-08-13 00:20:00
 */

import { ISession, remoteSessionOptions, sessionService } from "./fixtures";
import { RootCentered } from "./public-interface";
import type {
	CreateNodeWebSocketServer,
	IHttpServer,
	INodeWebSocket,
	INodeWebSocketServer,
	INodeWebSocketServerOptions,
	NodeErrorListener,
} from "./websocket-adapters";
import {
	createBrowserWebSocketConnectorAdapter,
	createWebSocketAcceptorAdapter,
} from "./websocket-adapters";

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

/** Exact glue for `import { WebSocketServer } from "ws"`. */
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
 * Real `ws` assembly owns the unavoidable Node type adaptation at this edge:
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
 * That bridge belongs beside the concrete `ws` dependency. Its Node imports do
 * not leak into this transport-neutral prototype; no RPC behavior is hidden.
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

/**
 * Express continues to handle ordinary HTTP requests. The WebSocket adapter
 * borrows the same server and handles only `/rpc` Upgrade requests.
 */
export async function webSocketExpressServerUsage<
	TApplication extends IExpressApplication,
>(platform: WebSocketExpressPlatform<TApplication>): Promise<void> {
	const app = platform.express();
	app.get("/health", (_request, response) => response.sendStatus(204));
	const httpServer = platform.createHttpServer(app);

	const remoteSession = RootCentered.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
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

	// listen() attaches Upgrade handling synchronously, then waits for this
	// borrowed HTTP server to become ready. Express middleware does not process
	// Upgrade requests; authentication is intentionally out of this prototype.
	try {
		const rpcReady = acceptor.listen();
		httpServer.listen(3_000);
		await rpcReady;
	} finally {
		// Application shutdown order: stop upgrades, dispose sessions, then let
		// the application close HTTP. The adapter never closes this server.
		acceptor.dispose();
		rpc.dispose();
		httpServer.close();
	}
}

/** Browser-side active topology for the Express-hosted `/rpc` endpoint. */
export async function browserWebSocketClientUsage(
	url = "wss://example.test/rpc",
): Promise<void> {
	const remoteSession = RootCentered.createRemoteServiceIdentifier(
		ISession,
		remoteSessionOptions,
	);
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
