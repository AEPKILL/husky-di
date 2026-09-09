/**
 * @overview Hosts bidirectional RPC and payload-free HTTP diagnostics on a loopback Node server.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
import {
	createRpcAcceptor,
	RpcEventTypeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";
import {
	REMOTE_BROWSER_DISPLAY_SERVICE,
	REMOTE_GREETING_SERVICE,
} from "@/consts/remote-services.const";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type { IExampleServer } from "@/interfaces/example-server.interface";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";

export type CreateExampleServerOptions = { readonly port?: number };

export async function createExampleServer(
	options: CreateExampleServerOptions = {},
): Promise<IExampleServer> {
	const acceptor = createRpcAcceptor();
	const diagnostics = createRpcDiagnostics();
	const events = acceptor.event$.subscribe((event) => {
		diagnostics.record(event);
		if (event.type === RpcEventTypeEnum.peerOpened) {
			event.peer.expose(REMOTE_GREETING_SERVICE, {
				greet,
				ready: () =>
					event.peer
						.resolve(REMOTE_BROWSER_DISPLAY_SERVICE)
						.showMessage("Node called this browser."),
			});
		}
	});
	const server = createServer((request, response) => {
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.setHeader("Cache-Control", "no-store");
		if (request.method === "GET" && request.url === "/health") {
			response.end(JSON.stringify({ status: "ok" }));
		} else if (request.method === "GET" && request.url === "/api/snapshot") {
			const state = acceptor.state;
			const snapshot: NodeDiagnosticsSnapshot = {
				ownerStatus: state.status,
				listenerStatus:
					state.status === RpcStateStatusEnum.active
						? state.listener.status
						: state.status,
				peerStatuses: acceptor.peers.map((peer) => peer.state.status),
				...diagnostics.snapshot(),
			};
			response.end(JSON.stringify(snapshot));
		} else {
			response.statusCode = 404;
			response.end(JSON.stringify({ error: "Not found" }));
		}
	});
	let shutdownTask: Promise<void> | undefined;
	const shutdown = () => {
		shutdownTask ??= (async () => {
			try {
				await acceptor.shutdown();
			} finally {
				events.unsubscribe();
				await new Promise<void>((resolve, reject) => {
					if (!server.listening) {
						resolve();
						return;
					}
					server.close((error) => (error ? reject(error) : resolve()));
				});
			}
		})();
		return shutdownTask;
	};
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(options.port ?? 3_000, "127.0.0.1", () => {
				server.off("error", reject);
				resolve();
			});
		});
		await acceptor.listen(
			createNodeWebSocketAcceptorAdapter({ server, path: "/rpc" }),
		);
		const address = server.address();
		if (address === null || typeof address === "string")
			throw new Error("Missing TCP address.");
		return { origin: `http://127.0.0.1:${address.port}`, shutdown };
	} catch (error) {
		await shutdown();
		throw error;
	}
}

async function greet(name: string, delayMs: number): Promise<string> {
	if (
		typeof name !== "string" ||
		name.trim().length === 0 ||
		name.length > 80
	) {
		throw new TypeError("name must contain 1 to 80 characters.");
	}
	if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 10_000) {
		throw new RangeError("delayMs must be an integer from 0 to 10000.");
	}
	await setTimeout(delayMs);
	return `Hello, ${name.trim()}!`;
}
