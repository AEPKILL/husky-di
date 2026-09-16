/**
 * @overview Verifies owner observations and local pending timing over real Lab RPC boundaries.
 * @author AEPKILL
 * @created 2026-09-11 21:52:40
 */

import assert from "node:assert/strict";
import { it } from "node:test";
import { setTimeout } from "node:timers/promises";
import { createRpcConnector, RpcCallDirectionEnum } from "@husky-di/remote";
import { createWebSocketConnectorAdapter } from "@husky-di/remote-websocket";
import { REMOTE_LAB_SERVICE } from "@/consts/lab-services.const";
import { createExampleServer } from "@/factories/example-server.factory";
import type { NodeDiagnosticsSnapshot } from "@/types/rpc-diagnostics.type";
import { createLabTraceContext } from "@/utils/create-lab-trace-context.util";
import { createLabTraceInterceptor } from "@/utils/create-lab-trace-interceptor.util";

it("EXAMPLE-LAB-OWNER-001 projects every Peer and retains locally timed pending calls through Clear", async () => {
	const server = await createExampleServer({ port: 0 });
	const contexts = [createLabTraceContext(), createLabTraceContext()];
	const connectors = contexts.map((traceContext) =>
		createRpcConnector({
			interceptor: createLabTraceInterceptor(traceContext),
		}),
	);
	const snapshot = async (): Promise<NodeDiagnosticsSnapshot> =>
		(await fetch(`${server.origin}/api/snapshot`)).json();
	try {
		await Promise.all(
			connectors.map((connector) =>
				connector.connect({
					adapter: createWebSocketConnectorAdapter({
						url: `${server.origin.replace("http", "ws")}/rpc`,
					}),
				}),
			),
		);
		const services = connectors.map((connector) =>
			connector.peer.resolve(REMOTE_LAB_SERVICE),
		);
		const ids = await Promise.all(
			services.map((service) => service.identify()),
		);
		const pending = contexts[0].run("owner-pause", () =>
			services[0].report(true, 0, new AbortController().signal),
		);
		void pending.catch(() => {});
		let observed = await snapshot();
		for (
			let index = 0;
			index < 100 &&
			!observed.pendingCalls.some((call) => call.method === "report");
			index += 1
		) {
			await setTimeout(10);
			observed = await snapshot();
		}
		assert.equal(observed.owner.status, "active");
		assert.equal(observed.listener?.status, "listening");
		assert.equal(
			observed.configuration.find((entry) => entry.name === "Adapter.listener")
				?.value,
			new URL(server.origin).host,
		);
		assert.deepEqual(
			observed.peers.map((peer) => peer.id),
			ids,
		);
		const call = observed.pendingCalls.find(
			(entry) => entry.method === "report",
		);
		assert.ok(call);
		assert.equal(call.peerId, ids[0]);
		assert.equal(call.direction, RpcCallDirectionEnum.incoming);
		assert.ok(call.startedAt <= observed.observedAt);
		assert.ok(
			observed.configuration.some(
				(entry) =>
					entry.name === "runtime.maxSessions" &&
					entry.value === "64" &&
					entry.source === "specification default",
			),
		);
		await fetch(`${server.origin}/api/lab/records`, { method: "DELETE" });
		const cleared = await snapshot();
		assert.deepEqual(cleared.pendingCalls, observed.pendingCalls);
		assert.ok(cleared.observedAt >= observed.observedAt);
		assert.equal(await services[0].resume("owner-pause"), true);
		await pending;
		await connectors[1].shutdown();
		assert.equal((await snapshot()).peers.length, 1);
		assert.doesNotMatch(
			JSON.stringify(await snapshot()),
			/resumeToken|stack|cause|owner-pause/,
		);
	} finally {
		await Promise.all(connectors.map((connector) => connector.close()));
		await server.shutdown();
	}
});
