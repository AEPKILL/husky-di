/**
 * @overview Hosts bidirectional RPC, Lab scenarios, and separate application and safe diagnostic snapshots.
 * @author AEPKILL
 * @created 2026-09-09 23:59:09
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
import {
	createRpcAcceptor,
	RpcEventTypeEnum,
	type RpcInterceptor,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createNodeWebSocketAcceptorAdapter } from "@husky-di/remote-websocket/node";
import {
	REMOTE_BROWSER_DISPLAY_SERVICE,
	REMOTE_GREETING_SERVICE,
} from "@/consts/remote-services.const";
import { LabSideEnum } from "@/enums/lab-recording.enum";
import { createLabE2eRunner } from "@/factories/lab-e2e-runner.factory";
import { createLabHost } from "@/factories/lab-host.factory";
import { createLabRecorder } from "@/factories/lab-recorder.factory";
import { createObservedAcceptorAdapter } from "@/factories/observed-connector-adapter.factory";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type { IExampleServer } from "@/interfaces/example-server.interface";
import type { ILabE2eRunner } from "@/interfaces/lab-e2e-runner.interface";
import type { LabClearResult } from "@/types/lab-server.type";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import { createLabTraceInterceptor } from "@/utils/create-lab-trace-interceptor.util";
import { getLabConfiguration } from "@/utils/get-lab-configuration.util";
import { handleLabCustomRequest } from "@/utils/handle-lab-custom-request.util";
import { projectLabState } from "@/utils/project-lab-state.util";

export type CreateExampleServerOptions = {
	readonly port?: number;
	readonly e2eRunner?: ILabE2eRunner;
};

export async function createExampleServer(
	options: CreateExampleServerOptions = {},
): Promise<IExampleServer> {
	const traceContext = new AsyncLocalStorage<string>();
	const interceptor: RpcInterceptor = createLabTraceInterceptor({
		get: () => traceContext.getStore(),
		run: (traceId, operation) => traceContext.run(traceId, operation),
	});
	const configuredAcceptor = createRpcAcceptor({ interceptor });
	const diagnostics = createRpcDiagnostics();
	const recorder = createLabRecorder(LabSideEnum.node);
	const lab = createLabHost({
		acceptor: configuredAcceptor,
		recorder,
		traceContext: {
			get: () => traceContext.getStore(),
			run: (traceId, operation) => traceContext.run(traceId, operation),
		},
	});
	let e2e = options.e2eRunner;
	let listenerAddress = "unknown · not yet bound";
	const events = configuredAcceptor.event$.subscribe((event) => {
		if (event.type === RpcEventTypeEnum.peerOpened) {
			lab.openPeer(event.peer);
			event.peer.expose(REMOTE_GREETING_SERVICE, {
				greet,
				ready: () =>
					event.peer
						.resolve(REMOTE_BROWSER_DISPLAY_SERVICE)
						.showMessage("Node called this browser."),
			});
		}
		diagnostics.record(
			event,
			"peer" in event ? lab.peerId(event.peer) : undefined,
		);
		recorder.recordEvent(
			event,
			"peer" in event ? lab.peerId(event.peer) : undefined,
		);
		if (event.type === RpcEventTypeEnum.peerClosed) lab.closePeer(event.peer);
	});
	const server = createServer((request, response) => {
		response.setHeader("Content-Type", "application/json; charset=utf-8");
		response.setHeader("Cache-Control", "no-store");
		if (e2e?.handleRequest(request, response)) return;
		if (handleLabCustomRequest(request, response, lab.custom)) return;
		if (request.method === "GET" && request.url === "/health") {
			response.end(JSON.stringify({ status: "ok" }));
		} else if (request.method === "GET" && request.url === "/api/lab") {
			response.end(JSON.stringify(lab.snapshot()));
		} else if (
			request.method === "DELETE" &&
			request.url === "/api/lab/records"
		) {
			recorder.clear();
			diagnostics.clear();
			const result: LabClearResult = {
				lab: lab.snapshot(),
				diagnostics: diagnostics.snapshot(),
			};
			response.end(JSON.stringify(result));
		} else if (request.method === "GET" && request.url === "/api/snapshot") {
			const state = configuredAcceptor.state;
			const snapshot: NodeDiagnosticsSnapshot = {
				owner: projectLabState(state),
				...(state.status === RpcStateStatusEnum.active
					? { listener: projectLabState(state.listener) }
					: {}),
				peers: configuredAcceptor.peers.map((peer) => ({
					id: lab.peerId(peer),
					state: projectLabState(peer.state),
				})),
				configuration: getLabConfiguration(false, listenerAddress),
				ownerStatus: state.status,
				listenerStatus:
					state.status === RpcStateStatusEnum.active
						? state.listener.status
						: state.status,
				peerStatuses: configuredAcceptor.peers.map((peer) => peer.state.status),
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
				try {
					await e2e?.shutdown();
				} finally {
					lab.resumeAll();
					await configuredAcceptor.shutdown();
				}
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
		const address = server.address();
		if (address === null || typeof address === "string")
			throw new Error("Missing TCP address.");
		listenerAddress = `127.0.0.1:${address.port}`;
		e2e ??= createLabE2eRunner({
			endpoint: `ws://${listenerAddress}/rpc`,
			nodeRecorder: recorder,
		});
		await configuredAcceptor.listen(
			createObservedAcceptorAdapter(
				createNodeWebSocketAcceptorAdapter({ server, path: "/rpc" }),
				recorder,
			),
		);
		return { origin: `http://${listenerAddress}`, shutdown };
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
