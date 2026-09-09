/**
 * @overview Executable evidence for browser/Node RPC example requirements over real WebSockets.
 * @author AEPKILL
 * @created 2026-09-09 00:00:00
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
	createRpcConnector,
	RpcCallDirectionEnum,
	RpcCallStatusEnum,
	RpcEventTypeEnum,
	RpcException,
	RpcExceptionCodeEnum,
	RpcStateStatusEnum,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { NEVER } from "rxjs";
import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import { createExampleClient } from "@/factories/example-client.factory";
import { createExampleServer } from "@/factories/example-server.factory";
import { createRpcDiagnostics } from "@/factories/rpc-diagnostics.factory";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import { getPeerStatusLabel } from "@/web/utils/get-peer-status-label.util";
import "./lab/lab-scenarios.test";
import "./recording/recording.test";

describe("Remote Lab specification", () => {
	it("EXAMPLE-WS-STATE-001 labels actual disconnection separately from reconnection attempts", () => {
		const labels = [
			[RpcStateStatusEnum.unbound, "Not connected"],
			[RpcStateStatusEnum.connecting, "Connecting"],
			[RpcStateStatusEnum.connected, "Live transport"],
			[RpcStateStatusEnum.recovering, "Transport disconnected"],
			[RpcStateStatusEnum.draining, "Disconnecting"],
			[RpcStateStatusEnum.closed, "Connection closed"],
		] as const;
		for (const [status, expected] of labels)
			assert.equal(getPeerStatusLabel(status), expected);
	});

	it("EXAMPLE-WS-OBSERVE-001 retains pending calls even after their start events leave the recent window", async () => {
		const connector = createRpcConnector();
		try {
			const diagnostics = createRpcDiagnostics();
			const call = {
				peer: connector.peer,
				direction: RpcCallDirectionEnum.outgoing,
				service: "greeting",
				method: "greet",
			};
			diagnostics.record({
				...call,
				type: RpcEventTypeEnum.callStarted,
				observationId: "slow",
			});
			for (let index = 0; index < 30; index += 1) {
				diagnostics.record({
					...call,
					type: RpcEventTypeEnum.callStarted,
					observationId: `fast-${index}`,
				});
				diagnostics.record({
					...call,
					type: RpcEventTypeEnum.callFinished,
					observationId: `fast-${index}`,
					outcome: RpcCallStatusEnum.fulfilled,
					durationMs: 1,
				});
			}
			assert.equal(diagnostics.snapshot().recentEvents.length, 24);
			assert.deepEqual(
				diagnostics.snapshot().pendingCalls.map((call) => call.observationId),
				["slow"],
			);
			diagnostics.record({
				...call,
				type: RpcEventTypeEnum.callFinished,
				observationId: "slow",
				outcome: RpcCallStatusEnum.fulfilled,
				durationMs: 100,
			});
			assert.equal(diagnostics.snapshot().pendingCalls.length, 0);
			assert.equal(diagnostics.snapshot().totalEvents, 62);
		} finally {
			await connector.shutdown();
		}
	});

	it("EXAMPLE-WS-RECOVERY-001 leaves initial failure observable without application retries", async () => {
		let attempts = 0;
		const client = createExampleClient({
			adapterFactory: () => {
				attempts += 1;
				return {
					connection$: NEVER,
					async connect() {
						throw new Error("Offline");
					},
				};
			},
			display: { showMessage: () => "test page" },
		});
		try {
			await assert.rejects(client.reconnection.connect());
			assert.equal(
				client.reconnection.state.status,
				RpcStateStatusEnum.stopped,
			);
			assert.equal(attempts, 1);
			assert.equal(client.shutdown(), client.shutdown());
			await client.shutdown();
			assert.equal(client.connector.state.status, RpcStateStatusEnum.closed);
		} finally {
			await client.shutdown();
		}
	});

	it("EXAMPLE-WS-RECOVERY-001 replaces a lost socket and retains its in-flight call and Peer", {
		timeout: 10_000,
	}, async () => {
		const server = await createExampleServer({ port: 0 });
		const sockets: WebSocket[] = [];
		class ObservedWebSocketImpl extends WebSocket {
			constructor(url: string | URL, protocols?: string | string[]) {
				super(url, protocols);
				sockets.push(this);
			}
		}
		let attempts = 0;
		const client = createExampleClient({
			adapterFactory: () => {
				attempts += 1;
				return createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
					webSocket: ObservedWebSocketImpl,
				});
			},
			display: { showMessage: () => "Recovery test" },
		});
		const states: RpcStateStatusEnum[] = [];
		const state = client.connector.peer.state$.subscribe((value) =>
			states.push(value.status),
		);
		const shutdownOrder: string[] = [];
		const supervision = client.reconnection.state$.subscribe((value) => {
			if (value.status === RpcStateStatusEnum.stopped)
				shutdownOrder.push("stop");
		});
		const events = client.connector.event$.subscribe((value) => {
			if (value.type === RpcEventTypeEnum.ownerDraining)
				shutdownOrder.push("drain");
		});
		try {
			await client.reconnection.connect();
			const peer = client.connector.peer;
			const greeter = peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Recovery test");
			const pending = greeter.greet("Recovery", 250);
			await eventually(async () =>
				(await snapshot(server.origin)).pendingCalls.some(
					(call) => call.method === "greet",
				),
			);
			sockets[0].close();
			assert.equal(await pending, "Hello, Recovery!");
			assert.equal(client.connector.peer, peer);
			assert.equal(attempts, 2);
			assert.equal(sockets.length, 2);
			assert.ok(states.includes(RpcStateStatusEnum.recovering));
			assert.equal(
				client.connector.peer.state.status,
				RpcStateStatusEnum.connected,
			);
			assert.equal(await greeter.greet("Still here", 0), "Hello, Still here!");
			await client.shutdown();
			assert.deepEqual(shutdownOrder, ["stop", "drain"]);
		} finally {
			state.unsubscribe();
			supervision.unsubscribe();
			events.unsubscribe();
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-WS-LIFETIME-001 drains an in-flight proxied call before SIGTERM exits the dev process", {
		timeout: 15_000,
	}, async () => {
		const child = spawn(
			process.execPath,
			["--import", "tsx", "src/server/dev.ts"],
			{
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		child.stdout.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.stderr.on("data", (chunk: Buffer) => {
			output += chunk.toString();
		});
		const exited = new Promise<{
			code: number | null;
			signal: NodeJS.Signals | null;
		}>((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => resolve({ code, signal }));
		});
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({ url: "ws://127.0.0.1:5173/rpc" }),
			display: { showMessage: () => "Signal test browser" },
		});
		try {
			await eventually(() => {
				assert.equal(child.exitCode, null, output);
				return output.includes("http://127.0.0.1:5173");
			});
			assert.equal((await fetch("http://127.0.0.1:5173/")).status, 200);
			await client.reconnection.connect();
			const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Signal test browser");
			const pending = greeter.greet("Signal drain", 500);
			// Observe the server's admitted handler, then deliver SIGTERM to the actual owner process.
			await eventually(async () =>
				(await snapshot("http://127.0.0.1:3000")).pendingCalls.some(
					(call) => call.method === "greet",
				),
			);
			assert.equal(child.kill("SIGTERM"), true);
			assert.equal(
				await Promise.race([
					pending,
					exited.then((result) => {
						throw new Error(
							`Dev process exited before RPC drain: ${JSON.stringify(result)}`,
						);
					}),
				]),
				"Hello, Signal drain!",
			);
			assert.deepEqual(await exited, { code: 0, signal: null }, output);
			await assert.rejects(fetch("http://127.0.0.1:3000/health"));
			await assert.rejects(fetch("http://127.0.0.1:5173/"));
		} finally {
			if (child.exitCode === null && child.signalCode === null)
				child.kill("SIGKILL");
			await exited;
			await client.shutdown();
		}
	});

	it("EXAMPLE-WS-RPC-001 / OBSERVE-001 / LIFETIME-001 runs both RPC directions, parallel delayed calls and graceful draining", {
		timeout: 10_000,
	}, async () => {
		const server = await createExampleServer({ port: 0 });
		const messages: string[] = [];
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
				}),
			display: {
				showMessage(message) {
					messages.push(message);
					return "Example test browser";
				},
			},
		});
		try {
			assert.equal((await fetch(`${server.origin}/health`)).status, 200);
			await client.reconnection.connect();
			const greeter = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			assert.equal(await greeter.ready(), "Example test browser");
			assert.deepEqual(messages, ["Node called this browser."]);
			const calls = [
				greeter.greet("Ada", 200),
				greeter.greet("Grace", 200),
				greeter.greet("Linus", 200),
			];
			await eventually(
				async () => (await snapshot(server.origin)).pendingCalls.length === 3,
			);
			const pending = await snapshot(server.origin);
			assert.deepEqual(pending.peerStatuses, [RpcStateStatusEnum.connected]);
			assert.equal(pending.listenerStatus, RpcStateStatusEnum.listening);
			assert.ok(
				pending.pendingCalls.every(
					(call) => call.direction === RpcCallDirectionEnum.incoming,
				),
			);
			assert.equal(JSON.stringify(pending).includes("Ada"), false);
			assert.deepEqual(await Promise.all(calls), [
				"Hello, Ada!",
				"Hello, Grace!",
				"Hello, Linus!",
			]);
			for (const [name, delay] of [
				["", 0],
				["Ada", -1],
				["Ada", 10_001],
				["Ada", 0.5],
			] as const) {
				await assert.rejects(
					greeter.greet(name, delay),
					(error: unknown) =>
						error instanceof RpcException &&
						error.code === RpcExceptionCodeEnum.handlerFailed,
				);
			}
			const retained = greeter.greet("Drain", 100);
			await eventually(
				async () => (await snapshot(server.origin)).pendingCalls.length === 1,
			);
			const shutdown = server.shutdown();
			assert.equal(shutdown, server.shutdown());
			assert.equal(await retained, "Hello, Drain!");
			await shutdown;
			await assert.rejects(fetch(`${server.origin}/health`));
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});
});

async function snapshot(origin: string): Promise<NodeDiagnosticsSnapshot> {
	return (await fetch(`${origin}/api/snapshot`)).json();
}

async function eventually(
	check: () => boolean | Promise<boolean>,
): Promise<void> {
	const deadline = Date.now() + 3_000;
	while (!(await check())) {
		assert.ok(
			Date.now() < deadline,
			"Condition did not become true within 3 seconds.",
		);
		await setTimeout(5);
	}
}
