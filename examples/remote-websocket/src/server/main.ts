/**
 * @overview Hosts the Hono RPC service and handles both RPC directions in Node.
 * @author AEPKILL
 * @created 2026-08-20 23:09:54
 */

import type { Server } from "node:http";

import { createAdaptorServer } from "@hono/node-server";
import {
	createRpcAcceptor,
	type IRpcPeer,
	RpcEventTypeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";
import { Hono } from "hono";

import {
	REMOTE_BROWSER_DISPLAY_SERVICE,
	REMOTE_GREETING_SERVICE,
} from "@/consts/remote-services.const";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";

const SERVER_HOST = "127.0.0.1";
const SERVER_PORT = 3_000;

async function main(): Promise<void> {
	const acceptor = createRpcAcceptor();
	const pendingCalls = new Set<string>();
	let totalEvents = 0;
	const events = acceptor.event$.subscribe((event) => {
		totalEvents += 1;
		if (event.type === RpcEventTypeEnum.callStarted) {
			pendingCalls.add(event.observationId);
		} else if (event.type === RpcEventTypeEnum.callFinished) {
			pendingCalls.delete(event.observationId);
		}
		if (event.type === RpcEventTypeEnum.peerOpened) {
			void callBrowser(event.peer).catch(console.error);
		}
	});

	acceptor.expose(REMOTE_GREETING_SERVICE, {
		async greet(name, delayMs) {
			assertDelay(delayMs);
			await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
			return `Hello, ${name}!`;
		},
	});

	const app = new Hono();
	app.get("/health", (context) => context.json({ status: "ok" }));
	app.get("/api/snapshot", (context) =>
		context.json({
			ownerStatus: acceptor.state.status,
			listenerStatus:
				acceptor.state.status === RpcStateStatusEnum.active
					? acceptor.state.listener.status
					: acceptor.state.status,
			peerCount: acceptor.peers.length,
			peerStatuses: acceptor.peers.map((peer) => peer.state.status),
			pendingCalls: pendingCalls.size,
			totalEvents,
		} satisfies NodeDiagnosticsSnapshot),
	);
	const httpServer = createAdaptorServer({ fetch: app.fetch }) as Server;

	try {
		await listen(httpServer);
		await acceptor.listen(
			createNodeWebSocketAcceptorAdapter({
				server: httpServer,
				path: "/rpc",
			}),
		);

		console.log(`Hono RPC server: ws://${SERVER_HOST}:${SERVER_PORT}/rpc`);
		await waitForShutdownSignal();
	} finally {
		events.unsubscribe();
		try {
			await acceptor.close();
		} finally {
			await close(httpServer);
		}
	}
}

function assertDelay(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
		throw new RangeError("delayMs must be a safe integer from 0 to 10000.");
	}
}

async function callBrowser(peer: IRpcPeer): Promise<void> {
	const browserDisplay = peer.resolve(REMOTE_BROWSER_DISPLAY_SERVICE);
	const title = await browserDisplay.showMessage("Node called this browser.");
	console.log(`Browser replied with page title: ${title}`);
}

async function listen(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(SERVER_PORT, SERVER_HOST, () => {
			server.off("error", reject);
			resolve();
		});
	});
}

async function close(server: Server): Promise<void> {
	if (!server.listening) {
		return;
	}
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error === undefined ? resolve() : reject(error)));
	});
}

async function waitForShutdownSignal(): Promise<void> {
	await new Promise<void>((resolve) => {
		const shutdown = () => {
			process.off("SIGINT", shutdown);
			process.off("SIGTERM", shutdown);
			resolve();
		};
		process.once("SIGINT", shutdown);
		process.once("SIGTERM", shutdown);
	});
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
