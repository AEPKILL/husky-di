/**
 * @overview Node `ws` Connector and Acceptor Adapter factories.
 * @author AEPKILL
 * @created 2026-08-19 00:00:00
 */

import type {
	IRpcAcceptorAdapter,
	IRpcConnectorAdapter,
} from "@husky-di/remote";
import { WebSocket as NodeWebSocket, WebSocketServer } from "ws";

import { NodeWebSocketAcceptorAdapterImpl } from "@/impls/node-web-socket-acceptor-adapter.impl";
import { WebSocketConnectorAdapterImpl } from "@/impls/web-socket-connector-adapter.impl";
import type {
	INodeWebSocketAcceptorAdapterOptions,
	INodeWebSocketConnectorAdapterOptions,
} from "@/interfaces/node-web-socket-options.interface";
import type {
	ICreatedNodeWebSocketServer,
	IWebSocketLike,
} from "@/interfaces/web-socket-platform.interface";
import {
	assertSafeIntegerAtLeast,
	assertSafeIntegerAtMost,
	normalizeWebSocketTransportLimits,
} from "@/utils/web-socket-policy.util";
import {
	assertWebSocketHeaders,
	assertWebSocketOptionsObject,
	isWebSocketProtocolList,
} from "@/utils/web-socket-validation.util";

/** Creates a cold Connector Adapter using the Node `ws` client. */
export function createNodeWebSocketConnectorAdapter(
	options: INodeWebSocketConnectorAdapterOptions,
): IRpcConnectorAdapter {
	assertWebSocketOptionsObject(options, "Node WebSocket Connector");
	const limits = normalizeWebSocketTransportLimits(options);
	if (options.handshakeTimeoutMs !== undefined) {
		assertSafeIntegerAtLeast(
			options.handshakeTimeoutMs,
			1,
			"handshakeTimeoutMs",
		);
	}
	if (options.headers !== undefined) {
		assertWebSocketHeaders(options.headers);
	}
	const protocols = isWebSocketProtocolList(options.protocols)
		? [...options.protocols]
		: options.protocols;
	const clientOptions = Object.freeze({
		headers: options.headers,
		followRedirects: options.followRedirects,
		handshakeTimeout: options.handshakeTimeoutMs,
		rejectUnauthorized: options.rejectUnauthorized,
		perMessageDeflate: false,
		maxPayload: limits.maxMessageBytes,
	});

	return new WebSocketConnectorAdapterImpl(
		() =>
			new NodeWebSocket(
				options.url,
				protocols as string | string[] | undefined,
				clientOptions,
			) as unknown as IWebSocketLike,
		limits,
	);
}

/** Creates a cold Acceptor Adapter using a Node `ws` server. */
export function createNodeWebSocketAcceptorAdapter(
	options: INodeWebSocketAcceptorAdapterOptions,
): IRpcAcceptorAdapter {
	assertWebSocketOptionsObject(options, "Node WebSocket Acceptor");
	const hasPort = options.port !== undefined;
	const hasServer = options.server !== undefined;
	if (hasPort === hasServer) {
		throw new TypeError('Exactly one of "port" or "server" is required.');
	}
	if (options.port !== undefined) {
		assertSafeIntegerAtLeast(options.port, 0, "port");
		assertSafeIntegerAtMost(options.port, 65_535, "port");
	}
	if (options.backlog !== undefined) {
		assertSafeIntegerAtLeast(options.backlog, 0, "backlog");
	}
	const maxConnections = options.maxConnections ?? 64;
	assertSafeIntegerAtLeast(maxConnections, 1, "maxConnections");
	const limits = normalizeWebSocketTransportLimits(options);

	return new NodeWebSocketAcceptorAdapterImpl(
		(): ICreatedNodeWebSocketServer => {
			const server = new WebSocketServer({
				port: options.port,
				server: options.server,
				host: options.host,
				backlog: options.backlog,
				path: options.path,
				perMessageDeflate: options.perMessageDeflate ?? false,
				clientTracking: false,
				maxPayload: limits.maxMessageBytes,
			});
			return {
				server,
				alreadyListening: options.server?.listening === true,
			};
		},
		limits,
		maxConnections,
	);
}
