/**
 * @overview Adapts adapter source conformance and Session capacity assertions to real Node sockets.
 * @author AEPKILL
 * @created 2026-09-15 01:34:08
 */

import type { ILabCase } from "@husky-di/example-remote-lab/sdk";

export const labCase: ILabCase = {
	title: "WebSocket · source conformance and bounded Session capacity",
	timeoutMs: 20000,
	async run(ctx) {
		ctx.log("Adapted specification sources", [
			"packages/remote-websocket/tests/conformance.test.ts#connector.source.multicast-terminal-single-use",
			"packages/remote/tests/specification/session-capacity.test.ts",
		]);
		const server = await ctx.environment.node("services/server.ts", {
			maxSessions: 1,
		});
		const endpoint = (server.result as { endpoint: string }).endpoint;
		const first = await ctx.environment.node("services/node-client.ts", {
			endpoint,
			label: "first",
		});
		await ctx.step(
			"Node adapter source multicasts one connection and terminates once",
			async () => {
				const result = await first.call<{
					same: boolean;
					completed: number;
					lateValues: number;
					lateCompleted: boolean;
					rejected: boolean;
					retainedResult: string;
				}>("sourceConformance");
				ctx.assert(
					result.same && result.completed === 2,
					"All current subscribers receive the same single handed-off Connection",
					result,
				);
				ctx.assert(
					result.lateValues === 0 && result.lateCompleted && result.rejected,
					"Late source is terminal and adapter is single-use",
					result,
				);
				ctx.assert(
					result.retainedResult === "same-handed-off-connection",
					"Source completion does not revoke its actual handed-off Connection",
				);
			},
		);
		await ctx.step(
			"Session capacity rejects excess admission without harming admitted Peer",
			async () => {
				const extra = await ctx.environment.node("services/node-client.ts", {
					endpoint,
					label: "excess",
					expectRejected: true,
				});
				ctx.assert(
					(extra.result as { rejected: boolean }).rejected,
					"Excess Peer is rejected at configured capacity",
					extra.result,
				);
				ctx.assert(
					(await first.call("echo", "admitted")) === "admitted",
					"Existing Peer keeps its valid Session",
				);
			},
		);
	},
};
