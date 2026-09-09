/**
 * @overview Verifies Remote Lab business scenarios over the real server and WebSocket client boundary.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createServiceIdentifier } from "@husky-di/core";
import {
	createRemoteServiceDescriptor,
	RpcCallDirectionEnum,
	RpcEventTypeEnum,
	RpcException,
	RpcExceptionCodeEnum,
} from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import {
	LAB_SERVICE_NAMES,
	REMOTE_LAB_BROWSER_SERVICE,
	REMOTE_LAB_SERVICE,
	REMOTE_PEER_LAB_SERVICE,
	REMOTE_SHIPPING_SERVICE,
} from "@/consts/lab-services.const";
import { REMOTE_GREETING_SERVICE } from "@/consts/remote-services.const";
import { createExampleClient } from "@/factories/example-client.factory";
import { createExampleServer } from "@/factories/example-server.factory";
import type { LabServerSnapshot } from "@/types/lab-server.type";

describe("Remote Lab scenarios", () => {
	it("EXAMPLE-LAB-RESOURCE-001 rejects calls beyond the configured pending budget and keeps the peer usable", async () => {
		const server = await createExampleServer({ port: 0 });
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
				}),
			display: { showMessage: () => "Capacity browser" },
			runtimePolicy: { maxPendingInvocationsPerSession: 2 },
		});
		try {
			await client.reconnection.connect();
			const greeting = client.connector.peer.resolve(REMOTE_GREETING_SERVICE);
			await greeting.ready();
			const results = await Promise.allSettled([
				greeting.greet("First", 100),
				greeting.greet("Second", 100),
				greeting.greet("Over budget", 100),
			]);
			assert.equal(
				results.filter((result) => result.status === "fulfilled").length,
				2,
			);
			const failures = results.filter((result) => result.status === "rejected");
			assert.equal(failures.length, 1);
			assert.ok(hasCode(RpcExceptionCodeEnum.unavailable)(failures[0].reason));
			assert.equal(
				await greeting.greet("Capacity released", 0),
				"Hello, Capacity released!",
			);
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-RPC-001 returns a real shipping quote and records sample payloads separately from safe diagnostics", async () => {
		const server = await createExampleServer({ port: 0 });
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
				}),
			display: { showMessage: () => "Lab test browser" },
		});
		try {
			await client.reconnection.connect();
			const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
			const shipping = client.connector.peer.resolve(REMOTE_SHIPPING_SERVICE);
			assert.match(await lab.identify(), /^peer-\d+$/);
			assert.deepEqual(
				{
					...(await shipping.quote("shipping-trace", "Shanghai", "Beijing", 2)),
				},
				{
					from: "Shanghai",
					to: "Beijing",
					kg: 2,
					amount: 20,
					currency: "CNY",
				},
			);
			const recorded = await (await fetch(`${server.origin}/api/lab`)).json();
			assert.ok(JSON.stringify(recorded).includes("Shanghai"));
			const safe = await (await fetch(`${server.origin}/api/snapshot`)).json();
			assert.equal(JSON.stringify(safe).includes("Shanghai"), false);
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-VALUE-001 distinguishes legal values, local preflight rejection, handler failure and unknown methods", async () => {
		const server = await createExampleServer({ port: 0 });
		const client = connectClient(server.origin);
		try {
			await client.reconnection.connect();
			const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
			assert.deepEqual(
				structuredClone(
					await lab.echo("legal-value", {
						nested: [null, true, 1.5, "text"],
						empty: {},
					}),
				),
				{ nested: [null, true, 1.5, "text"], empty: {} },
			);
			const before = (await snapshot(server.origin)).recording.calls.length;
			let getterCalls = 0;
			const accessor = {
				get value() {
					getterCalls += 1;
					return 1;
				},
			};
			const cycle: { self?: unknown } = {};
			cycle.self = cycle;
			for (const value of [
				undefined,
				1n,
				Number.NaN,
				new Date(),
				cycle,
				accessor,
			])
				await assert.rejects(lab.echo("invalid-value", value), TypeError);
			assert.equal(getterCalls, 0);
			assert.equal(
				(await snapshot(server.origin)).recording.calls.length,
				before,
			);
			await assert.rejects(
				lab.fail("handler-failure"),
				hasCode(RpcExceptionCodeEnum.handlerFailed),
			);
			const missing = createRemoteServiceDescriptor(
				createServiceIdentifier<{ missing(): string }>("MissingLabMethod"),
				{ wireName: LAB_SERVICE_NAMES.lab, methods: { missing: true } },
			);
			await assert.rejects(
				client.connector.peer.resolve(missing).missing(),
				hasCode(RpcExceptionCodeEnum.unknownMethod),
			);
			assert.equal(
				await lab.echo("healthy-after-errors", "still connected"),
				"still connected",
			);
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-DEBUG-001 keeps a canceled caller terminal after the paused handler resumes", async () => {
		const server = await createExampleServer({ port: 0 });
		const client = connectClient(server.origin);
		const terminalCodes: string[] = [];
		const events = client.connector.event$.subscribe((event) => {
			if (
				event.type === RpcEventTypeEnum.callFinished &&
				event.direction === RpcCallDirectionEnum.outgoing &&
				event.method === "report"
			)
				terminalCodes.push("code" in event ? event.code : event.outcome);
		});
		try {
			await client.reconnection.connect();
			const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
			const controller = new AbortController();
			const report = lab.report("paused-report", true, 0, controller.signal);
			const rejection = assert.rejects(
				report,
				hasCode(RpcExceptionCodeEnum.canceled),
			);
			await eventually(
				async () => (await snapshot(server.origin)).pausedReports.length === 1,
			);
			controller.abort();
			await rejection;
			await eventually(
				async () =>
					(await snapshot(server.origin)).pausedReports[0]?.aborted === true,
			);
			assert.equal((await snapshot(server.origin)).peers[0].handlerEntries, 1);
			assert.equal(await lab.resume("paused-report"), true);
			await eventually(async () =>
				(await snapshot(server.origin)).recording.calls.some(
					(call) =>
						call.traceId === "paused-report" && call.outcome === "fulfilled",
				),
			);
			await assert.rejects(report, hasCode(RpcExceptionCodeEnum.canceled));
			assert.deepEqual(terminalCodes, ["canceled"]);
			assert.equal(await lab.resume("paused-report"), false);
			const recorded = (await snapshot(server.origin)).recording.calls.find(
				(call) => call.traceId === "paused-report",
			);
			assert.ok(
				recorded?.phases.some(
					(phase) => phase.phase === "handler-signal-aborted",
				),
			);
			assert.equal(JSON.parse(recorded?.result ?? "null").aborted, true);
		} finally {
			events.unsubscribe();
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-RECOVERY-001 resumes a paused report through the retained facade without entering its handler twice", {
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
		const client = createExampleClient({
			adapterFactory: () =>
				createWebSocketConnectorAdapter({
					url: `${server.origin.replace("http:", "ws:")}/rpc`,
					webSocket: ObservedWebSocketImpl,
				}),
			display: { showMessage: () => "Recovery browser" },
		});
		try {
			await client.reconnection.connect();
			const lab = client.connector.peer.resolve(REMOTE_LAB_SERVICE);
			const id = await lab.identify();
			const report = lab.report("recovery-report", true, 0, undefined);
			await eventually(
				async () => (await snapshot(server.origin)).pausedReports.length === 1,
			);
			sockets[0].close();
			await eventually(
				() => sockets.length === 2 && sockets[1].readyState === WebSocket.OPEN,
			);
			assert.equal(await lab.identify(), id);
			await lab.resume("recovery-report");
			assert.deepEqual(
				{ ...(await report) },
				{
					traceId: "recovery-report",
					rows: 42,
					handlerEntries: 1,
					aborted: false,
				},
			);
			assert.equal((await snapshot(server.origin)).peers[0].handlerEntries, 1);
		} finally {
			await Promise.all([client.shutdown(), server.shutdown()]);
		}
	});

	it("EXAMPLE-LAB-EXPOSURE-001 / PEERS-001 isolates per-peer cleanup, global cleanup and application fanout", async () => {
		const server = await createExampleServer({ port: 0 });
		const messages = [[], []] as string[][];
		const clients = messages.map((received, index) => {
			const client = connectClient(server.origin);
			client.connector.peer.expose(REMOTE_LAB_BROWSER_SERVICE, {
				receive: (_traceId, message) => {
					if (index === 1 && message === "partial failure")
						throw new Error("Private browser failure detail");
					received.push(message);
					return `Browser ${index + 1}`;
				},
			});
			return client;
		});
		try {
			await Promise.all(clients.map((client) => client.reconnection.connect()));
			const controls = clients.map((client) =>
				client.connector.peer.resolve(REMOTE_LAB_SERVICE),
			);
			const scoped = clients.map((client) =>
				client.connector.peer.resolve(REMOTE_PEER_LAB_SERVICE),
			);
			const global = clients.map((client) =>
				client.connector.peer.resolve(REMOTE_SHIPPING_SERVICE),
			);
			const ids = await Promise.all(
				controls.map((control) => control.identify()),
			);
			assert.notEqual(ids[0], ids[1]);
			assert.deepEqual(
				await Promise.all(scoped.map((service) => service.inspect())),
				ids,
			);
			assert.match(await controls[0].conflict(), /TypeError/);
			assert.equal(await controls[0].setPeerExposure(ids[1], false), false);
			await assert.rejects(
				scoped[1].inspect(),
				hasCode(RpcExceptionCodeEnum.unknownService),
			);
			assert.equal(await scoped[0].inspect(), ids[0]);
			assert.equal(await controls[0].setPeerExposure(ids[1], true), true);
			assert.equal(await scoped[1].inspect(), ids[1]);
			assert.equal(await controls[0].setGlobalExposure(false), false);
			for (const service of global)
				await assert.rejects(
					service.quote("revoked", "A", "B", 1),
					hasCode(RpcExceptionCodeEnum.unknownService),
				);
			assert.match(await controls[0].conflict(), /TypeError/);
			assert.equal((await snapshot(server.origin)).globalExposure, false);
			await controls[0].setGlobalExposure(true);
			assert.equal((await global[1].quote("restored", "A", "B", 1)).amount, 16);
			assert.equal(await controls[0].callback(ids[1], "targeted"), "Browser 2");
			assert.deepEqual(messages, [[], ["targeted"]]);
			const fanout = await controls[0].fanout("broadcast");
			assert.deepEqual(
				fanout.map((result) => result.peerId).sort(),
				[...ids].sort(),
			);
			assert.deepEqual(messages, [["broadcast"], ["targeted", "broadcast"]]);
			assert.deepEqual(
				structuredClone(await controls[0].fanout("partial failure")),
				[
					{ peerId: ids[0], outcome: "fulfilled", result: "Browser 1" },
					{ peerId: ids[1], outcome: "rejected", result: "handler-failed" },
				],
			);
		} finally {
			await Promise.all([
				...clients.map((client) => client.shutdown()),
				server.shutdown(),
			]);
		}
	});
});

function connectClient(origin: string) {
	return createExampleClient({
		adapterFactory: () =>
			createWebSocketConnectorAdapter({
				url: `${origin.replace("http:", "ws:")}/rpc`,
			}),
		display: { showMessage: () => "Lab test browser" },
	});
}

function hasCode(code: RpcExceptionCodeEnum) {
	return (error: unknown) =>
		error instanceof RpcException && error.code === code;
}

async function snapshot(origin: string): Promise<LabServerSnapshot> {
	return (await fetch(`${origin}/api/lab`)).json();
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
