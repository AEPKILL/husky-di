/**
 * @overview Assemble official ws clients and bounded listeners behind the public transport seam.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@husky-di/remote/transport";
import { WebSocket, WebSocketServer } from "ws";
import { createWebSocketConnection } from "@/modules/connection";
import { createSocketConnectorAdapter } from "@/modules/connector";
import type { IWebSocketLike } from "@/shared/interfaces/web-socket-platform.interface";
import {
	assertInteger,
	normalizeWebSocketAddress,
	normalizeWebSocketLimits,
} from "@/shared/utils/web-socket-policy.util";
import {
	type CreateNodeWebSocketAcceptorAdapterOptions,
	NodeWebSocketAcceptorAdapterImpl,
} from "../impls/node-web-socket-acceptor-adapter.impl";
import type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "../interfaces/node-web-socket-options.interface";

export type CreateSocketAcceptorAdapterOptions = Omit<
	CreateNodeWebSocketAcceptorAdapterOptions,
	"createConnection"
>;

export function createNodeWebSocketConnectorAdapter(
	options: INodeWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	const limits = normalizeWebSocketLimits(options);
	assertInteger(
		limits.maxMessageBytes,
		1_048_576,
		"maxMessageBytes",
		2_147_483_647,
	);
	const { url, protocols } = normalizeWebSocketAddress(
		options.url,
		options.protocols,
	);
	if (options.handshakeTimeoutMs !== undefined)
		assertInteger(
			options.handshakeTimeoutMs,
			1,
			"handshakeTimeoutMs",
			2_147_483_647,
		);
	for (const value of [options.followRedirects, options.rejectUnauthorized])
		if (value !== undefined && typeof value !== "boolean")
			throw new TypeError("WebSocket flags must be booleans.");
	const headers =
		options.headers === undefined ? undefined : { ...options.headers };
	if (
		options.headers !== undefined &&
		(typeof options.headers !== "object" ||
			options.headers === null ||
			Array.isArray(options.headers) ||
			Object.values(headers ?? {}).some((value) => typeof value !== "string"))
	)
		throw new TypeError("headers must be a string record.");
	const clientOptions = {
		headers,
		followRedirects: options.followRedirects ?? false,
		handshakeTimeout: options.handshakeTimeoutMs,
		rejectUnauthorized: options.rejectUnauthorized ?? true,
		perMessageDeflate: false,
		maxPayload: limits.maxMessageBytes,
	};
	return createSocketConnectorAdapter({
		createSocket: () =>
			new WebSocket(url, protocols, clientOptions) as unknown as IWebSocketLike,
		limits,
	});
}
export function createNodeWebSocketAcceptorAdapter(
	options: INodeWebSocketAcceptorAdapterOptions,
): IRpcAcceptorAdapter {
	const limits = normalizeWebSocketLimits(options);
	assertInteger(
		limits.maxMessageBytes,
		1_048_576,
		"maxMessageBytes",
		2_147_483_647,
	);
	if ((options.port === undefined) === (options.server === undefined))
		throw new TypeError('Exactly one of "port" or "server" is required.');
	if (options.port !== undefined)
		assertInteger(options.port, 0, "port", 65_535);
	if (options.backlog !== undefined)
		assertInteger(options.backlog, 0, "backlog", 2_147_483_647);
	if (
		options.server !== undefined &&
		(typeof options.server !== "object" ||
			options.server === null ||
			typeof options.server.on !== "function" ||
			typeof options.server.removeListener !== "function")
	)
		throw new TypeError("server must be an HTTP(S) server.");
	if (options.host !== undefined && typeof options.host !== "string")
		throw new TypeError("host must be a string.");
	if (
		options.path !== undefined &&
		(typeof options.path !== "string" || !options.path.startsWith("/"))
	)
		throw new TypeError("path must start with /.");
	if (
		options.perMessageDeflate !== undefined &&
		typeof options.perMessageDeflate !== "boolean"
	)
		throw new TypeError("perMessageDeflate must be a boolean.");
	const maxConnections = options.maxConnections ?? 64;
	assertInteger(maxConnections, 1, "maxConnections");
	const serverOptions = {
		port: options.port,
		server: options.server,
		host: options.host,
		backlog: options.backlog,
		path: options.path,
		perMessageDeflate: options.perMessageDeflate ?? false,
		clientTracking: false,
		maxPayload: limits.maxMessageBytes,
	};
	return createSocketAcceptorAdapter({
		limits,
		maxConnections,
		createListener: (canAccept) => {
			const server = new WebSocketServer({
				...serverOptions,
				verifyClient: () => canAccept(),
			});
			const ignoreError = (): void => {};
			server.on("error", ignoreError);
			server.once("close", () => server.off("error", ignoreError));
			return {
				alreadyListening: serverOptions.server?.listening === true,
				onListening: (listener) => {
					server.on("listening", listener);
					return () => {
						server.off("listening", listener);
					};
				},
				onConnection: (listener) => {
					const accept = (socket: WebSocket): void =>
						listener(socket as unknown as IWebSocketLike);
					server.on("connection", accept);
					return () => {
						server.off("connection", accept);
					};
				},
				onError: (listener) => {
					server.on("error", listener);
					return () => {
						server.off("error", listener);
					};
				},
				onClose: (listener) => {
					server.on("close", listener);
					return () => {
						server.off("close", listener);
					};
				},
				close: () => {
					server.close();
				},
			};
		},
	});
}
export function createSocketAcceptorAdapter(
	options: CreateSocketAcceptorAdapterOptions,
): IRpcAcceptorAdapter {
	return new NodeWebSocketAcceptorAdapterImpl({
		...options,
		createConnection: createWebSocketConnection,
	});
}
